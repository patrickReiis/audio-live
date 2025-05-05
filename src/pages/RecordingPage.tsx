import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { io, Socket } from 'socket.io-client';
import { getBestSupportedFormat, getFileExtension, logSupportedFormats } from '@/lib/audioUtils';
import { logBrowserInfo, logAudioCapabilities, logPermissions } from '@/lib/debug';

const SERVER_URL = 'http://localhost:3001';

const RecordingPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioFormat, setAudioFormat] = useState<string>('audio/webm');
  const [isAudioAvailable, setIsAudioAvailable] = useState(true);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [sessionCreated, setSessionCreated] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataTimerRef = useRef<number | null>(null);
  
  // Check browser support for various audio formats
  useEffect(() => {
    // Log debugging information
    logBrowserInfo();
    logAudioCapabilities();
    logPermissions().catch(err => console.error("Error logging permissions:", err));
    
    // Log all supported formats for debugging
    logSupportedFormats();
    
    // Find the best supported format
    const bestFormat = getBestSupportedFormat();
    if (bestFormat) {
      console.log("Using best supported format:", bestFormat);
      setAudioFormat(bestFormat);
    } else {
      console.warn("No supported audio formats detected, defaulting to audio/webm");
    }
    
    // Check if we have access to audio input at all
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // Confirm we have access by getting a stream and immediately releasing it
        stream.getTracks().forEach(track => track.stop());
        setIsAudioAvailable(true);
      })
      .catch(err => {
        console.error("Microphone access error:", err);
        setIsAudioAvailable(false);
      });
  }, []);
  
  // Initialize the component
  useEffect(() => {
    // Connect to socket server
    socketRef.current = io(SERVER_URL);
    
    // If we have a sessionId, join that session
    if (sessionId) {
      socketRef.current.emit('join-session', sessionId);
      setIsHost(false);
      setSessionCreated(true);
    } else {
      // If no sessionId, we're the host
      setIsHost(true);
      setSessionCreated(false);
    }
    
    // Listen for new participants
    socketRef.current.on('participant-joined', (participantId: string) => {
      setParticipants(prev => [...prev, participantId]);
      console.log("Participant joined:", participantId);
    });
    
    // Listen for participants leaving
    socketRef.current.on('participant-left', (participantId: string) => {
      setParticipants(prev => prev.filter(id => id !== participantId));
      console.log("Participant left:", participantId);
    });
    
    // Listen for audio data from other participants
    socketRef.current.on('audio-chunk', (audioChunk: Blob) => {
      try {
        // Play the received audio chunk
        const audioBlob = new Blob([audioChunk], { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        audio.play().catch(err => console.error("Error playing received audio:", err));
      } catch (error) {
        console.error("Error processing received audio chunk:", error);
      }
    });
    
    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {
          console.error("Error stopping MediaRecorder during cleanup:", err);
        }
      }
      
      if (dataTimerRef.current) {
        clearInterval(dataTimerRef.current);
      }
    };
  }, [sessionId]);
  
  // Process audio data when recording stops
  const processRecordedAudio = () => {
    console.log("Processing recorded audio...");
    
    if (audioChunksRef.current.length === 0) {
      console.error("No audio data was collected!");
      setRecordingError("No audio data was collected. Please try again.");
      return;
    }
    
    // Use the current format or fallback to webm
    const currentMimeType = mediaRecorderRef.current?.mimeType || audioFormat || 'audio/webm';
    const blobOptions = { type: currentMimeType };
    console.log("Creating audio blob with options:", blobOptions);
    
    const audioBlob = new Blob(audioChunksRef.current, blobOptions);
    console.log("Created audio blob of size:", audioBlob.size, "bytes");
    
    if (audioBlob.size > 0) {
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudioURL(audioUrl);
      setRecordingError(null);
    } else {
      console.error("Audio blob is empty!");
      setRecordingError("Recorded audio is empty. Please check your microphone and try again.");
    }
  };
  
  // Create a new Nostr session ID if we're the host
  const createSession = async () => {
    if (isHost && !sessionId && !sessionCreated) {
      const newSessionId = uuidv4();
      socketRef.current?.emit('create-session', newSessionId);
      navigate(`/recording/${newSessionId}`, { replace: true });
      setSessionCreated(true);
      return newSessionId;
    }
    return sessionId;
  };
  
  // Start recording function
  const startRecording = async () => {
    console.log("Starting recording with format:", audioFormat);
    setRecordingError(null);
    audioChunksRef.current = [];
    
    try {
      // Create a session if needed
      const activeSessionId = await createSession();
      console.log("Active session ID:", activeSessionId);
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      streamRef.current = stream;
      
      // Set up MediaRecorder with supported options
      const options = { mimeType: audioFormat };
      let mediaRecorder;
      
      try {
        mediaRecorder = new MediaRecorder(stream, options);
        console.log("Using format:", audioFormat);
      } catch (err) {
        console.warn(`Format ${audioFormat} is not supported, falling back to default`);
        mediaRecorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Debug recording state
      console.log("MediaRecorder initial state:", mediaRecorder.state);
      
      mediaRecorder.ondataavailable = (event) => {
        console.log("Data available event. Size:", event.data.size);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          // Send audio chunk to server if we're not muted
          if (socketRef.current && !isMuted) {
            socketRef.current.emit('audio-chunk', event.data, activeSessionId);
          }
        }
      };
      
      mediaRecorder.onstart = () => {
        console.log("MediaRecorder started:", mediaRecorder.state);
      };
      
      mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped. Chunks collected:", audioChunksRef.current.length);
        processRecordedAudio();
      };
      
      mediaRecorder.onerror = (event: any) => {
        console.error("MediaRecorder error:", event);
        setRecordingError(`Recording error: ${event.error}`);
      };
      
      // Start recording - with a small time slice value to ensure we get data
      mediaRecorder.start(500); // Collect data every 500ms
      
      // Set a timer to periodically request data to ensure we have something
      dataTimerRef.current = window.setInterval(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.requestData();
        }
      }, 2000);
      
      setIsRecording(true);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setRecordingError(`Could not start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Enhanced stop recording function
  const stopRecording = () => {
    console.log("Stopping recording...");
    
    try {
      // First clear our data request timer
      if (dataTimerRef.current) {
        clearInterval(dataTimerRef.current);
        dataTimerRef.current = null;
      }
      
      if (mediaRecorderRef.current) {
        console.log("MediaRecorder state before stop:", mediaRecorderRef.current.state);
        
        if (mediaRecorderRef.current.state === 'recording') {
          // Request any available data
          mediaRecorderRef.current.requestData();
          
          // Allow a brief moment for the data to be processed
          setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
              console.log("MediaRecorder stopped");
              
              // Stop all audio tracks
              if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                  track.stop();
                  console.log("Audio track stopped");
                });
              }
              
              // Update UI state
              setIsRecording(false);
            }
          }, 200);
        } else {
          console.warn("MediaRecorder not in recording state:", mediaRecorderRef.current.state);
          
          // Process any audio data we may have even if recorder wasn't officially recording
          if (audioChunksRef.current.length > 0) {
            processRecordedAudio();
          }
          
          setIsRecording(false);
        }
      } else {
        console.warn("MediaRecorder not initialized");
        setIsRecording(false);
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      setRecordingError(`Error stopping recording: ${error instanceof Error ? error.message : String(error)}`);
      
      // Force UI update even on error
      setIsRecording(false);
      
      // If there was an error but we have chunks, try to process them
      if (audioChunksRef.current.length > 0) {
        processRecordedAudio();
      }
    }
  };
  
  // Save recording function
  const saveRecording = () => {
    if (audioURL) {
      console.log("Saving recording...");
      
      // Get the current MIME type from mediaRecorder
      const currentMimeType = mediaRecorderRef.current?.mimeType || audioFormat || 'audio/webm';
      console.log("Current MIME type:", currentMimeType);
      
      // Determine the correct file extension based on format
      const fileExtension = getFileExtension(currentMimeType);
      
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = audioURL;
      a.download = `recording.${fileExtension}`;
      a.click();
      document.body.removeChild(a);
      
      console.log("Recording saved as", `recording.${fileExtension}`);
    }
  };
  
  // Toggle mute function
  const toggleMute = () => {
    setIsMuted(!isMuted);
    console.log("Mute toggled to:", !isMuted);
  };
  
  // Create new session function
  const createNewSession = () => {
    navigate('/');
  };
  
  // Discard recording function
  const discardRecording = () => {
    if (audioURL) {
      window.URL.revokeObjectURL(audioURL);
    }
    setAudioURL(null);
    setRecordingError(null);
    console.log("Recording discarded");
  };
  
  // Copy session link function
  const copySessionLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url)
      .then(() => {
        console.log("Session link copied to clipboard");
        alert('Session link copied to clipboard!');
      })
      .catch(err => {
        console.error("Failed to copy session link:", err);
      });
  };
  
  if (!isAudioAvailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-red-500">
              Microphone Access Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">
              This application needs access to your microphone to work. Please grant microphone permission and reload the page.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-center">
            {isHost ? 'Host Audio Session' : 'Join Audio Session'}
          </CardTitle>
          {sessionId && (
            <div className="flex justify-center mt-2">
              <Badge variant="outline" className="text-xs">
                Session: {sessionId.substring(0, 8)}...
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={copySessionLink}
                className="ml-2 h-5 px-2"
              >
                Copy Link
              </Button>
            </div>
          )}
        </CardHeader>
        
        <CardContent>
          {sessionId && (
            <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-100">
              <p className="text-sm text-blue-700">
                {isHost 
                  ? "Share this page's URL with others so they can join your recording session."
                  : "You've joined a recording session. Speak to participate or click Record to save your own copy."}
              </p>
            </div>
          )}
        
          {participants.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Participants</h3>
              <div className="flex flex-wrap gap-2">
                {participants.map((id) => (
                  <Badge key={id} variant="secondary">
                    User {id.substring(0, 5)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {recordingError && (
            <div className="mb-4 p-3 bg-red-50 rounded-md border border-red-200">
              <p className="text-sm text-red-700">{recordingError}</p>
            </div>
          )}
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="mute" className="cursor-pointer">Mute Microphone</Label>
              <Switch 
                id="mute" 
                checked={isMuted} 
                onCheckedChange={toggleMute} 
                disabled={!isRecording}
              />
            </div>
            
            {/* Status indicator */}
            {isRecording && (
              <div className="flex items-center mt-2 space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm">Recording...</span>
              </div>
            )}
            
            {audioURL && (
              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">Preview Recording</h3>
                <audio src={audioURL} controls className="w-full" />
              </div>
            )}
          </div>
        </CardContent>
        
        <CardFooter className="flex justify-center flex-wrap space-x-2 gap-y-2">
          {!isRecording && !audioURL && (
            <Button onClick={startRecording} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-white"></span>
              Record
            </Button>
          )}
          
          {isRecording && (
            <Button 
              onClick={stopRecording} 
              variant="destructive" 
              className="flex items-center gap-2 px-4 py-2"
            >
              <span className="w-3 h-3 rounded-full"></span>
              Stop Recording
            </Button>
          )}
          
          {audioURL && (
            <>
              <Button onClick={saveRecording} variant="default">
                Save
              </Button>
              <Button onClick={discardRecording} variant="outline">
                Discard
              </Button>
              <Button onClick={createNewSession} variant="secondary">
                New Session
              </Button>
            </>
          )}
          
          {!audioURL && !isRecording && !isHost && (
            <Button onClick={createNewSession} variant="outline">
              Leave Session
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default RecordingPage;