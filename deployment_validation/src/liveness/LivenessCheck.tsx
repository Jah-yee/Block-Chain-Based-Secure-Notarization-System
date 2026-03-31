import React, { useRef, useState, useEffect } from 'react';

const LivenessCheck: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recordedVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Request camera access and set stream to video element
    const getCameraStream = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        alert('Could not access camera. Please allow camera permissions.');
      }
    };

    getCameraStream();

    return () => {
      // Cleanup: stop all tracks on unmount
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleStartRecording = () => {
    if (!stream) return;
    setRecordedChunks([]);
    const options = { mimeType: 'video/webm; codecs=vp9' };
    const mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        setRecordedChunks(prev => [...prev, event.data]);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Liveness Check</h2>
      <div>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', maxWidth: '480px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
      </div>
      <div style={{ marginTop: '1rem' }}>
        {!isRecording ? (
          <button onClick={handleStartRecording} style={{ marginRight: '1rem' }}>
            Start Recording
          </button>
        ) : (
          <button onClick={handleStopRecording} style={{ marginRight: '1rem' }}>
            Stop
          </button>
        )}
      </div>
      {recordedVideoUrl && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Recorded Video Playback</h3>
          <video
            ref={recordedVideoRef}
            src={recordedVideoUrl}
            controls
            style={{ width: '100%', maxWidth: '480px', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </div>
      )}
    </div>
  );
};

export default LivenessCheck;
