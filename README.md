# Audio Live

A real-time audio recording and sharing application built with React, Socket.IO, and WebRTC. This application allows users to record audio and share it live with others through a unique session link.

## Features

- Record audio directly in the browser
- Generate shareable session links
- Join existing recording sessions
- Real-time audio streaming between participants
- Save recordings locally as MP3, OGG, or WebM (depending on browser support)
- Mute/unmute functionality
- No authentication required - just record and share

## Technology Stack

- **Frontend**: React 18, TailwindCSS, shadcn/ui, Socket.IO Client, MediaRecorder API
- **Backend**: Node.js, Express, Socket.IO
- **Other**: UUID for session generation

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm (v7+)
- A modern browser that supports the MediaRecorder API (Chrome, Firefox, Edge recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/audio-live.git
   cd audio-live
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start both the server and client:
   ```bash
   npm run start
   ```

This will launch:
- The React frontend at [http://localhost:8080](http://localhost:8080)
- The Socket.IO server at [http://localhost:3001](http://localhost:3001)

## Usage

1. **Start a Recording Session**:
   - Visit the home page
   - Click "Start Recording"
   - Allow microphone access when prompted
   - Click the red "Record" button to start recording

2. **Share Your Session**:
   - Once recording has started, copy the session URL
   - Share this URL with others to join your session

3. **Join an Existing Session**:
   - Use the session URL directly, or
   - Enter the session ID on the home page and click "Join"

4. **Save Your Recording**:
   - Click "Stop Recording" when done
   - Click "Save" to download the audio file
   - Or "Discard" to delete the recording

## Troubleshooting

### No Audio is Being Recorded

If you're experiencing issues with audio recording:

1. **Check Browser Compatibility**:
   - Open your browser's developer console (F12)
   - Look for "Audio Recording Capabilities" in the console log
   - Verify that your browser supports MediaRecorder and the appropriate audio formats

2. **Verify Microphone Permissions**:
   - Check that you've granted microphone access to the site
   - In Chrome: Click the lock icon (🔒) in the address bar and ensure microphone access is allowed
   - In Firefox: Click the shield icon in the address bar to manage permissions

3. **Check Microphone Hardware**:
   - Ensure your microphone is properly connected and working
   - Try testing your microphone in another application

4. **Use a Supported Browser**:
   - Chrome, Firefox, and Edge provide the best support for the MediaRecorder API
   - Safari has limited support for some audio formats

### File Format Issues

By default, the application tries to save recordings in the best format supported by your browser:

- MP3 is preferred for compatibility but not all browsers support recording directly to MP3
- OGG is the next preferred format, with good compression and quality
- WebM is the fallback format, supported by most browsers

If you need a specific format, you may need to convert the file after downloading.

## Development

- Run only the frontend: `npm run dev`
- Run only the server: `npm run server`
- Build for production: `npm run build`

## How It Works

1. The application uses the `MediaRecorder` API to capture audio from the user's microphone
2. Audio data is sent in chunks to the Socket.IO server
3. The server broadcasts these chunks to all other participants in the session
4. When the recording is stopped, the audio chunks are combined into a single audio file that can be saved

## Privacy and Security

- No data is stored on the server permanently
- Audio data is only shared with participants who have the direct session link
- Sessions are deleted from the server when all participants leave

## License

This project is licensed under the MIT License - see the LICENSE file for details.