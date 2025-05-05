import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Index = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState('');

  // Start a new recording session
  const startNewSession = () => {
    navigate('/recording');
  };

  // Join an existing session
  const joinSession = () => {
    if (sessionId.trim()) {
      navigate(`/recording/${sessionId.trim()}`);
    }
  };

  // Handle Enter key press in the input field
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
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
          <div className="space-y-4">
            <div>
              <Button 
                className="w-full py-6 text-lg" 
                size="lg" 
                onClick={startNewSession}
              >
                Start Recording
              </Button>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gray-100 px-2 text-gray-500">Or join a session</span>
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
                />
                <Button onClick={joinSession} disabled={!sessionId.trim()}>
                  Join
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-gray-500">
            No login required - just record and share!
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Index;