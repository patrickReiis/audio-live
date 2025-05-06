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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  const [connectedToRoom, setConnectedToRoom] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<{code: string, message: string} | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dataTimerRef = useRef<number | null>(null);
  const prevMuteStateRef = useRef<boolean>(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const isProcessingStopRef = useRef<boolean>(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Check browser support for audio recording
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
      
    // Create audio element for remote audio
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.muted = false;
    audioEl.volume = 1.0;
    
    // Some browsers require interaction before playing audio
    const enableAudio = () => {
      audioEl.play().catch(err => {
        console.log("Initial audio play failed, waiting for user interaction", err);
      });
      document.removeEventListener('click', enableAudio);
    };
    document.addEventListener('click', enableAudio);
    
    remoteAudioRef.current = audioEl;
    
    return () => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.src = '';
      }
    };
  }, []);
  
  // Initialize the component and connect to socket
  useEffect(() => {
    console.log("Initializing with session ID:", sessionId);
    setIsLoading(true);
    
    // Connect to socket server
    socketRef.current = io(SERVER_URL);
    const socket = socketRef.current;
    
    // Setup event listeners for socket
    socket.on('connect', () => {
      console.log('Connected to server with socket id:', socket.id);
      
      if (sessionId) {
        // Try to join existing session
        console.log("Attempting to join session:", sessionId);
        socket.emit('join-session', sessionId);
      } else {
        // No session ID - we're ready to create one
        console.log('No session ID, ready to host');
        setIsHost(true);
        setIsLoading(false);
      }
    });
    
    // Handle connection successful
    socket.on('connection-successful', ({ sessionId: sid, role }) => {
      console.log(`Successfully connected to session ${sid} as ${role}`);
      activeSessionIdRef.current = sid;
      setIsHost(role === 'host');
      setSessionCreated(true);
      setConnectedToRoom(true);
      setIsLoading(false);
    });
    
    // Handle session errors
    socket.on('session-error', ({ code, message }) => {
      console.error(`Session error: ${code} - ${message}`);
      setSessionError({ code, message });
      setIsLoading(false);
    });
    
    socket.on('connect_error', (err) => {
      console.error('Socket.IO connection error:', err);
      setRecordingError(`Connection error: ${err.message}. Please reload the page.`);
      setIsLoading(false);
    });
    
    // Listen for new participants
    socket.on('participant-joined', (participantId: string) => {
      console.log("Participant joined:", participantId);
      setParticipants(prev => {
        if (prev.includes(participantId)) return prev;
        return [...prev, participantId];
      });
    });
    
    // Listen for participants leaving
    socket.on('participant-left', (participantId: string) => {
      console.log("Participant left:", participantId);
      setParticipants(prev => prev.filter(id => id !== participantId));
    });
    
    // Listen for participants list when joining
    socket.on('participants-list', (list: string[]) => {
      console.log("Received participants list:", list);
      setParticipants(list);
    });
    
    // Listen for audio data from other participants
    socket.on('audio-chunk', (data) => {
      try {
        console.log("Received audio chunk from another participant");
        const blob = new Blob([data], { type: 'audio/webm' });
        
        if (blob.size > 0) {
          // Create a URL for the blob
          const url = URL.createObjectURL(blob);
          
          // Play the remote audio
          if (remoteAudioRef.current) {
            remoteAudioRef.current.src = url;
            remoteAudioRef.current.onended = () => URL.revokeObjectURL(url);
            
            // Ensure audio is playing
            remoteAudioRef.current.play().catch(err => {
              console.error("Failed to play remote audio:", err);
            });
          }
          
          // Store remote audio chunks for our recording
          if (isRecording) {
            console.log("Adding remote audio to local recording");
            audioChunksRef.current.push(blob);
          }
        }
      } catch (error) {
        console.error("Error handling received audio:", error);
      }
    });
    
    // Listen for session stop signals from other participants
    socket.on('stop-recording', () => {
      console.log("Received stop recording signal from session");
      
      if (!isProcessingStopRef.current && isRecording) {
        isProcessingStopRef.current = true;
        stopRecording(false);
      }
    });
    
    socket.on('session-closed', (closedSessionId) => {
      console.log(`Session ${closedSessionId} has been closed`);
      
      if (activeSessionIdRef.current === closedSessionId) {
        console.log("Our current session was closed");
        
        if (isRecording) {
          stopRecording(false);
        }
        
        // Show message without redirecting
        setSessionError({
          code: 'SESSION_CLOSED',
          message: 'This recording session has been closed by the host.'
        });
      }
    });
    
    // Clean up on unmount
    return () => {
      console.log("Component unmounting, cleaning up resources");
      
      if (socket) {
        socket.disconnect();
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
  }, [sessionId, navigate]);
  
  // Watch for changes to mute state and apply them
  useEffect(() => {
    if (isRecording && prevMuteStateRef.current !== isMuted) {
      console.log("Mute state changed to:", isMuted);
      
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(track => {
          track.enabled = !isMuted;
          console.log(`Audio track ${track.id} enabled:`, track.enabled);
        });
      }
      
      // Update reference for next comparison
      prevMuteStateRef.current = isMuted;
    }
  }, [isMuted, isRecording]);
  
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
  
  // Create a new session ID if we're the host
  const createSession = async () => {
    if (isHost && !sessionCreated) {
      const newSessionId = uuidv4();
      console.log("Creating new session with ID:", newSessionId);
      
      if (socketRef.current) {
        socketRef.current.emit('create-session', newSessionId);
        activeSessionIdRef.current = newSessionId;
        setSessionCreated(true);
        setConnectedToRoom(true);
        navigate(`/recording/${newSessionId}`, { replace: true });
      }
      
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
      // Create or join a session
      const activeSessionId = await createSession();
      activeSessionIdRef.current = activeSessionId;
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
      
      // Apply mute state immediately if necessary
      if (isMuted) {
        stream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
      
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
      
      // Handle data available events
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log("Audio data available event. Size:", event.data.size);
          
          // Add to our local recording chunks
          audioChunksRef.current.push(event.data);
          
          // Send audio chunk to server if we're not muted and connected to a session
          if (socketRef.current && activeSessionIdRef.current) {
            // Only send audio if not muted
            if (!isMuted) {
              console.log(`Sending audio chunk to session ${activeSessionIdRef.current}`);
              socketRef.current.emit('audio-chunk', event.data, activeSessionIdRef.current);
            } else {
              console.log("Not sending audio because we're muted");
            }
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
        setRecordingError(`Recording error: ${event.error || 'Unknown error'}`);
      };
      
      // Start recording - with a smaller time slice for more frequent chunks
      mediaRecorder.start(250); // Collect data every 250ms
      
      // Set a timer to periodically request data to ensure we have something
      dataTimerRef.current = window.setInterval(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.requestData();
        }
      }, 1000);
      
      // Initialize mute state tracking
      prevMuteStateRef.current = isMuted;
      
      // Update recording state
      setIsRecording(true);
      isProcessingStopRef.current = false;
      
      // Announce that we're recording in this session
      if (socketRef.current && activeSessionId) {
        socketRef.current.emit('recording-started', activeSessionId);
      }
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setRecordingError(`Could not start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Enhanced stop recording function - with optional emit parameter
  const stopRecording = (emitEvent = true) => {
    console.log("Stopping recording... Emit event:", emitEvent);
    
    try {
      // Set flag to prevent multiple stop processes
      if (isProcessingStopRef.current) {
        console.log("Already processing stop, ignoring duplicate request");
        return;
      }
      isProcessingStopRef.current = true;
      
      // Notify other participants if we should emit the event
      if (emitEvent && socketRef.current && activeSessionIdRef.current) {
        console.log("Broadcasting stop recording signal to session:", activeSessionIdRef.current);
        socketRef.current.emit('stop-recording', activeSessionIdRef.current);
      }
      
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
              isProcessingStopRef.current = false;
            }
          }, 300);
        } else {
          console.warn("MediaRecorder not in recording state:", mediaRecorderRef.current.state);
          
          // Process any audio data we may have even if recorder wasn't officially recording
          if (audioChunksRef.current.length > 0) {
            processRecordedAudio();
          }
          
          setIsRecording(false);
          isProcessingStopRef.current = false;
        }
      } else {
        console.warn("MediaRecorder not initialized");
        setIsRecording(false);
        isProcessingStopRef.current = false;
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      setRecordingError(`Error stopping recording: ${error instanceof Error ? error.message : String(error)}`);
      
      // Force UI update even on error
      setIsRecording(false);
      isProcessingStopRef.current = false;
      
      // If there was an error but we have chunks, try to process them
      if (audioChunksRef.current.length > 0) {
        processRecordedAudio();
      }
    }
  };
  
  // Close the session completely (host only)
  const closeSession = () => {
    if (isHost && activeSessionIdRef.current) {
      console.log("Closing session:", activeSessionIdRef.current);
      
      if (isRecording) {
        stopRecording(false);
      }
      
      // Tell server to close the session
      if (socketRef.current) {
        socketRef.current.emit('close-session', activeSessionIdRef.current);
      }
      
      // Navigate back to home
      navigate('/');
    } else {
      // Non-hosts just leave the session
      leaveSession();
    }
  };
  
  // Leave the current session
  const leaveSession = () => {
    if (activeSessionIdRef.current && socketRef.current) {
      if (isRecording) {
        stopRecording(false);
      }
      
      socketRef.current.emit('leave-session', activeSessionIdRef.current);
    }
    
    // Navigate back to home
    navigate('/');
  };
  
  // Save recording function
  const saveRecording = () => {
    if (audioURL) {
      console.log("Saving recording...");
      
      // Get the current MIME type from mediaRecorder
      const currentMimeType = mediaRecorderRef.current?.mimeType || audioFormat || 'audio/webm';
      console.log("Current MIME type:", currentMimeType);
      
      // Determine the correct file extension based on format
      let fileExtension = 'webm'; // Default fallback
      
      if (currentMimeType.includes('mp3') || currentMimeType.includes('mpeg')) {
        fileExtension = 'mp3';
      } else if (currentMimeType.includes('ogg')) {
        fileExtension = 'ogg';
      } else if (currentMimeType.includes('webm')) {
        fileExtension = 'webm';
      }
      
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
    if (!sessionId && !activeSessionIdRef.current) return;
    
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
  
  // Handle session error display and retry
  const handleSessionError = () => {
    navigate('/', { replace: true });
  };
  
  // Loading state
  if (isLoading && sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="text-center">
              Connecting to Session...
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-center">
              Checking if session {sessionId.substring(0, 8)}... exists
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Session error state
  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-red-500">
              Session Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>{sessionError.code}</AlertTitle>
              <AlertDescription>{sessionError.message}</AlertDescription>
            </Alert>
            <p className="text-center text-gray-600 mb-4">
              {sessionError.code === 'SESSION_NOT_FOUND' ? 
                "The session you're trying to join doesn't exist or has already ended." :
                sessionError.code === 'SESSION_CLOSED' ?
                "The host has ended this recording session." :
                "There was an error with the recording session."}
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button onClick={handleSessionError}>
              Return to Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Microphone not available state
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
  
  // Main app view
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-center">
            {isHost ? 'Host Audio Session' : 'Join Audio Session'}
          </CardTitle>
          {(sessionId || activeSessionIdRef.current) && (
            <div className="flex justify-center mt-2">
              <Badge variant="outline" className="text-xs">
                Session: {(sessionId || activeSessionIdRef.current)?.substring(0, 8)}...
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
          {(sessionId || activeSessionIdRef.current) && (
            <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-100">
              <p className="text-sm text-blue-700">
                {isHost 
                  ? "Share this page's URL with others so they can join your recording session."
                  : "You've joined a recording session. Speak to participate or click Record to save your own copy."}
              </p>
            </div>
          )}
          
          {/* Connection status indicator */}
          <div className="flex items-center mb-4 space-x-2">
            <div className={`w-2 h-2 rounded-full ${connectedToRoom ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
            <span className="text-xs text-gray-600">
              {connectedToRoom 
                ? `Connected to session ${activeSessionIdRef.current?.substring(0, 8) || ''}` 
                : 'Not connected to any session'}
            </span>
          </div>
        
          {participants.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Participants ({participants.length + 1})</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-green-100">
                  You
                </Badge>
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
                <div className={`w-3 h-3 rounded-full ${isMuted ? 'bg-gray-500' : 'bg-red-500 animate-pulse'}`}></div>
                <span className="text-sm">{isMuted ? 'Recording (Muted)' : 'Recording...'}</span>
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
              onClick={() => stopRecording(true)}
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
          
          {!audioURL && (sessionId || activeSessionIdRef.current) && (
            isHost ? (
              <Button onClick={closeSession} variant="outline" className="text-red-500 border-red-300">
                Close Session
              </Button>
            ) : (
              <Button onClick={leaveSession} variant="outline">
                Leave Session
              </Button>
            )
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default RecordingPage;