import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const SERVER_URL = 'http://localhost:3001';

const Index = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [socket, setSocket] = useState<any>(null);

  // Connect to socket server when component mounts
  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);
    
    newSocket.on('connect', () => {
      console.log('Connected to server from homepage with ID:', newSocket.id);
      setIsSocketConnected(true);
    });
    
    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      setIsSocketConnected(false);
    });
    
    // Clean up socket connection on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Create a new session and navigate to it
  const createNewSession = () => {
    if (!isSocketConnected || !socket) {
      setJoinError('Not connected to server. Please try again.');
      return;
    }
    
    setIsCreatingSession(true);
    setJoinError('');
    
    const newSessionId = uuidv4();
    console.log('Attempting to create new session:', newSessionId);
    
    // Register handlers before emitting to ensure we capture the response
    socket.once('connection-successful', (data: any) => {
      console.log('Session created successfully:', data);
      // Navigate directly to the session
      navigate(`/recording/${newSessionId}`);
    });
    
    socket.once('session-error', (error: any) => {
      console.error('Error creating session:', error);
      setJoinError(`Failed to create session: ${error.message}`);
      setIsCreatingSession(false);
    });
    
    // Emit the create session event
    socket.emit('create-session', newSessionId);
    
    // Set a timeout in case we don't get a response
    setTimeout(() => {
      if (isCreatingSession) {
        // If we're still in creating state after timeout, just navigate
        // to the recording page - the session will be created there
        console.log('No confirmation received, proceeding anyway');
        setIsCreatingSession(false);
        navigate(`/recording/${newSessionId}`);
      }
    }, 3000);
  };

  // Join an existing session
  const joinSession = () => {
    const trimmedSessionId = sessionId.trim();
    
    if (!trimmedSessionId) {
      return;
    }
    
    setIsChecking(true);
    setJoinError('');
    
    if (!socket || !isSocketConnected) {
      setJoinError('Not connected to server. Please try again.');
      setIsChecking(false);
      return;
    }
    
    // Check if session exists
    socket.emit('check-session', trimmedSessionId, (response: { exists: boolean }) => {
      if (response.exists) {
        // Session exists, navigate to it
        navigate(`/recording/${trimmedSessionId}`);
      } else {
        // Session doesn't exist
        setJoinError(`Session "${trimmedSessionId}" does not exist or has ended`);
        setIsChecking(false);
      }
    });
    
    // Set a timeout in case we don't get a response
    setTimeout(() => {
      if (isChecking) {
        setJoinError('Server is not responding. Please try again.');
        setIsChecking(false);
      }
    }, 5000);
  };

  // Handle Enter key press in the input field
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isChecking) {
      joinSession();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-center">Audio Live</CardTitle>
          <CardDescription className="text-center">
            Record audio and share it with others in real-time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isSocketConnected && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Cannot connect to server. Please check your internet connection.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4">
            {/* Create Session Button */}
            <div>
              <Button 
                className="w-full py-6 text-xl bg-red-500 hover:bg-red-600" 
                size="lg" 
                onClick={createNewSession}
                disabled={!isSocketConnected || isCreatingSession}
              >
                {isCreatingSession ? (
                  <span className="flex items-center justify-center w-full">
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Session...
                  </span>
                ) : "Create New Session"}
              </Button>
              {joinError && joinError.includes('create') && (
                <p className="text-sm text-red-500 mt-2">{joinError}</p>
              )}
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gray-100 px-2 text-gray-500">Or join existing session</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="session-id">Session ID</Label>
              <div className="flex space-x-2">
                <Input
                  id="session-id"
                  placeholder="Enter session ID"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isChecking || !isSocketConnected}
                />
                <Button 
                  onClick={joinSession} 
                  disabled={!sessionId.trim() || isChecking || !isSocketConnected}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isChecking ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Checking
                    </span>
                  ) : 'Join'}
                </Button>
              </div>
              
              {joinError && !joinError.includes('create') && (
                <p className="text-sm text-red-500 mt-2">{joinError}</p>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <p className="text-sm text-gray-500">
            No login required - just create a session and share!
          </p>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-500">
              {isSocketConnected ? `Connected to server (${socket?.id?.substring(0,8) || ''})` : 'Server not available'}
            </span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Index;