import React, { useState, useRef, useEffect } from 'react';
import { AudioRecorder } from '../shared/audio-recorder.js';
import { AudioStreamer } from '../shared/audio-streamer.js';
import GeminiLiveAPI from '../shared/gemini-live-api.js';
import { base64ToArrayBuffer } from '../shared/utils.js';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [buttonDisabled, setButtonDisabled] = useState(true);
  const audioContextRef = useRef(null);
  const audioStreamerRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const geminiRef = useRef(null);
  const outputRef = useRef(null);
  const initializedRef = useRef(false);
  const interruptedRef = useRef(false);

  const apiKey = 'PUT YOUR PRIVATE API KEY';
  const host = 'generativelanguage.googleapis.com';
  const endpoint = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  useEffect(() => {
    geminiRef.current = new GeminiLiveAPI(endpoint);
    setupGeminiHandlers();
  }, []);

  function setupGeminiHandlers() {
    const geminiAPI = geminiRef.current;
    geminiAPI.onSetupComplete = () => {
      setButtonDisabled(false);
    };

    geminiAPI.onAudioData = async (audioData) => {
      if (!audioStreamerRef.current.isPlaying) {
        logMessage('Gemini: Speaking...');
      }
      await playAudioChunk(audioData);
    };

    geminiAPI.onInterrupted = () => {
      logMessage('Gemini: Interrupted');
      interruptedRef.current = true;
      audioStreamerRef.current.stop();
    };

    geminiAPI.onTurnComplete = () => {
      logMessage('Gemini: Finished speaking');
      interruptedRef.current = false;
      audioStreamerRef.current.complete();
    };

    geminiAPI.onError = (message) => {
      logMessage(message);
    };

    geminiAPI.onClose = () => {
      logMessage('Connection closed');
    };
  }

  async function ensureAudioInitialized() {
    if (!initializedRef.current) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = ctx;
      audioStreamerRef.current = new AudioStreamer(ctx);
      await ctx.resume();
      initializedRef.current = true;
      console.log('Audio context initialized:', ctx.state);
    }
  }

  async function playAudioChunk(base64AudioChunk) {
    try {
      await ensureAudioInitialized();
      const arrayBuffer = base64ToArrayBuffer(base64AudioChunk);
      const uint8Array = new Uint8Array(arrayBuffer);
      audioStreamerRef.current.addPCM16(uint8Array);
      audioStreamerRef.current.resume();
    } catch (error) {
      console.error('Error queuing audio chunk:', error);
    }
  }

  async function startRecording() {
    try {
      await ensureAudioInitialized();
      interruptedRef.current = false;
      audioStreamerRef.current.stop();

      if (geminiRef.current.ws.readyState !== WebSocket.OPEN) {
        geminiRef.current = new GeminiLiveAPI(endpoint);
        setupGeminiHandlers();
        await new Promise((resolve) => {
          geminiRef.current.onSetupComplete = () => {
            resolve();
            setButtonDisabled(false);
          };
        });
      }

      audioRecorderRef.current = new AudioRecorder();
      await audioRecorderRef.current.start();

      audioRecorderRef.current.on('data', (base64Data) => {
        geminiRef.current.sendAudioChunk(base64Data);
      });

      logMessage('Recording started...');
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      logMessage('Error starting recording: ' + error.message);
    }
  }

  function stopRecording() {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      audioRecorderRef.current.off('data');
      logMessage('Recording stopped.');
      setIsRecording(false);
      interruptedRef.current = false;
      geminiRef.current.sendEndMessage();
    }
  }

  function toggleMicrophone() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function logMessage(message) {
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    outputRef.current?.appendChild(messageElement);
  }

  return (
    <div>
      <div className="header-section">
        <h1>Gemini Live Audio Chat</h1>
      </div>
      <div className="input-container">
        <button id="micButton" onClick={toggleMicrophone} disabled={buttonDisabled} className="action-button">
          {isRecording ? (
            <span className="material-symbols-outlined">stop</span>
          ) : (
            <span className="material-symbols-outlined">mic</span>
          )}
        </button>
      </div>
      <div id="output" ref={outputRef}></div>
    </div>
  );
}

export default App;
