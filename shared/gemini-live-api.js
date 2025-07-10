class GeminiLiveAPI {
  constructor(endpoint, autoSetup = true, setupConfig = null) {
    this.ws = new WebSocket(endpoint);
    this.onSetupComplete = () => { };
    this.onAudioData = () => { };
    this.onInterrupted = () => { };
    this.onTurnComplete = () => { };
    this.onError = () => { };
    this.onClose = () => { };
    this.onToolCall = () => { };
    this.onInputTranscriptionData = () => { };
    this.onOutputTranscriptionData = () => { };
    this.onTurnPairAvailable = () => { }; // ✅ New

    this.pendingSetupMessage = null;
    this.autoSetup = autoSetup;
    this.setupConfig = setupConfig;

    this.currentInputText = "";
    this.currentOutputText = "";

    this.setupWebSocket();
  }

  setupWebSocket() {
    this.ws.onopen = () => {
      console.log('WebSocket connection is opening...');
      if (this.autoSetup) {
        this.sendDefaultSetup();
      } else if (this.pendingSetupMessage) {
        console.log('Sending pending setup message:', this.pendingSetupMessage);
        this.ws.send(JSON.stringify(this.pendingSetupMessage));
        this.pendingSetupMessage = null;
      }
    };

    this.ws.onmessage = async (event) => {
      try {
        let wsResponse;
        if (event.data instanceof Blob) {
          const responseText = await event.data.text();
          wsResponse = JSON.parse(responseText);
        } else {
          wsResponse = JSON.parse(event.data);
        }

        console.log('WebSocket Response:', wsResponse);

        if (wsResponse.setupComplete) {
          this.onSetupComplete();
        } else if (wsResponse.toolCall) {
          this.onToolCall(wsResponse.toolCall);
        } else if (wsResponse.serverContent) {
          const content = wsResponse.serverContent;

          if (content.interrupted) {
            this.onInterrupted();
            return;
          }

          // if (content.inputTranscription?.text) {
          //   console.log("📥 Input transcription:", content.inputTranscription.text);
          //   this.currentInputText += content.inputTranscription.text + ' ';
          //   this.onInputTranscriptionData(content.inputTranscription.text);
          // }

          // if (content.outputTranscription?.text) {
          //   console.log("📤 Output transcription:", content.outputTranscription.text);
          //   this.currentOutputText += content.outputTranscription.text + ' ';
          //   this.onOutputTranscriptionData(content.outputTranscription.text);
          // }


          if (content.inputTranscription?.text) {
            this.currentInputText += content.inputTranscription.text;
          }

          if (content.outputTranscription?.text) {
            this.currentOutputText += content.outputTranscription.text;
          }

          if (content.modelTurn?.parts?.[0]?.inlineData) {
            const audioData = content.modelTurn.parts[0].inlineData.data;
            this.onAudioData(audioData);
          }

          if (content.turnComplete) {
            this.onTurnComplete();

            const cleanedOutput = this.currentOutputText.replace(/\s+/g, ' ').trim();
            const cleanedInput = this.currentInputText.replace(/\s+/g, ' ').trim();

            if (cleanedOutput || cleanedInput) {
              this.onTurnPairAvailable({
                // question: cleanedOutput,
                // answer: cleanedInput
                question: cleanedInput,
                answer: cleanedOutput
              });
              this.currentInputText = "";
              this.currentOutputText = "";
            }
          }
        }
      } catch (error) {
        console.error('Error parsing response:', error);
        this.onError('Error parsing response: ' + error.message);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
      this.onError('WebSocket Error: ' + error.message);
    };

    this.ws.onclose = (event) => {
      console.log('Connection closed:', event);
      this.onClose(event);
    };
  }

  sendMessage(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open. Current state:', this.ws.readyState);
      this.onError('WebSocket is not ready. Please try again.');
    }
  }

  sendSetupMessage(setupMessage) {
    if (this.ws.readyState === WebSocket.OPEN) {
      console.log('Sending setup message:', setupMessage);
      this.ws.send(JSON.stringify(setupMessage));
    } else {
      console.log('Connection not ready, queuing setup message');
      this.pendingSetupMessage = setupMessage;
    }
  }


  sendDefaultSetup() {
    const defaultConfig = {
      model: "models/gemini-2.0-flash-live-001",
      system_instruction: {
        parts: [
          { "text": "You are an interviewer. Always reply only in English, even if the user's input is in another language. If the user is not speaking English, politely ask them to continue in English only, and do NOT reply in any other language." }
        ]
      },
      generation_config: {
        response_modalities: ["audio"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: "Puck"
            }
          },
          language_code: "en-IN",
        }
      },
      input_audio_transcription: {},
      output_audio_transcription: {}
    };

    const setupMessage = {
      setup: this.setupConfig || defaultConfig
    };

    this.sendSetupMessage(setupMessage);
  }

  sendAudioChunk(base64Audio) {
    const message = {
      realtime_input: {
        media_chunks: [{
          mime_type: "audio/pcm",
          data: base64Audio
        }]
      }
    };
    console.log("Sending audio message: ", message);
    this.sendMessage(message);
  }

  sendEndMessage() {
    const message = {
      client_content: {
        turns: [{
          role: "user",
          parts: []
        }],
        turn_complete: true
      }
    };
    this.sendMessage(message);
  }

  sendContinueSignal() {
    const message = {
      client_content: {
        turns: [{
          role: "user",
          parts: []
        }],
        turn_complete: false
      }
    };
    this.sendMessage(message);
  }

  sendToolResponse(functionResponses) {
    const toolResponse = {
      tool_response: {
        function_responses: functionResponses
      }
    };
    console.log('Sending tool response:', toolResponse);
    this.sendMessage(toolResponse);
  }

  async ensureConnected() {
    if (this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      const onOpen = () => {
        clearTimeout(timeout);
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
        resolve();
      };

      const onError = (error) => {
        clearTimeout(timeout);
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
        reject(error);
      };

      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });
  }
}


