// AI Chat Widget JavaScript
class ChatWidget {
  constructor(tableId) {
    this.tableId = tableId;
    this.isOpen = false;
    this.isLoading = false;
    this.token = localStorage.getItem('token');
    this.API_BASE = window.API_BASE || '';
    this.conversationHistory = []; // Store conversation for context
    this.voiceEnabled = localStorage.getItem('lumaVoiceEnabled') === 'true'; // Voice preference
    this.autoPlayVoice = localStorage.getItem('lumaAutoPlayVoice') !== 'false'; // Auto-play preference (default true)
    this.currentAudio = null; // Track currently playing audio
    this.voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel - Most reliable, clear female voice
    
    // Enhanced conversation mode properties
    this.conversationMode = localStorage.getItem('lumaConversationMode') === 'true';
    this.speechEnabled = localStorage.getItem('lumaSpeechEnabled') === 'true';
    this.speechRecognition = null;
    this.isListening = false;
    this.lastSpeechTime = 0;
    this.silenceTimer = null;
    
    // New conversation state management
    this.conversationState = 'idle'; // 'idle', 'listening', 'processing', 'speaking'
    this.voiceActivityTimer = null;
    this.speechBuffer = '';
    this.minSpeechDuration = 500; // Minimum speech duration in ms
    this.maxSilenceDuration = 1500; // Maximum silence before auto-send in ms
    this.interruptionEnabled = true; // Allow interrupting AI responses
    
    this.init();
  }

  init() {
    // Load chat HTML and CSS if not already loaded
    this.loadChatComponents().then(() => {
      this.setupEventListeners();
      this.addWelcomeMessage();
      this.initializeSpeechRecognition();
    });
  }

  async loadChatComponents() {
    // Load CSS if not already loaded
    if (!document.querySelector('link[href*="chat.css"]')) {
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'css/chat.css';
      document.head.appendChild(cssLink);
    }

    // Load HTML if not already loaded
    if (!document.getElementById('chatButton')) {
      try {
        const response = await fetch('components/chat.html');
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
      } catch (error) {
        console.error('Failed to load chat component:', error);
        // Fallback - create basic HTML
        this.createFallbackHTML();
      }
    }
  }

  createFallbackHTML() {
    const chatHTML = `
      <div id="chatButton" class="chat-button">
        <span class="material-symbols-outlined">lightbulb_2</span>
      </div>
      <div id="chatPanel" class="chat-panel">
        <div class="chat-header">
          <div class="chat-header-left">
            <strong>Luma</strong>
            <span class="chat-subtitle">Event Assistant</span>
          </div>
          <div class="chat-header-controls">
            <button id="conversationModeBtn" class="conversation-mode-btn ${this.conversationMode ? 'active' : ''}" title="${this.conversationMode ? 'Conversation mode enabled' : 'Conversation mode disabled'}" ${!this.speechEnabled ? 'style="display: none;"' : ''}>
              <span class="material-symbols-outlined">${this.conversationMode ? 'record_voice_over' : 'voice_over_off'}</span>
            </button>
            <button id="autoPlayToggleBtn" class="auto-play-toggle-btn ${this.autoPlayVoice && this.voiceEnabled ? 'active' : ''}" title="${this.autoPlayVoice ? 'Auto-play enabled' : 'Auto-play disabled'}" ${!this.voiceEnabled ? 'style="display: none;"' : ''}>
              <span class="material-symbols-outlined">${this.autoPlayVoice ? 'play_circle' : 'pause_circle'}</span>
            </button>
            <button id="closeChatBtn" class="close-chat-btn">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div id="chatMessages" class="chat-messages"></div>
        <div class="chat-input-container">
          <input id="chatInput" type="text" placeholder="Type a message or start voice conversation..." class="chat-input">
          <button id="sendBtn" class="send-btn">
            <span class="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatHTML);
  }

  setupEventListeners() {
    const chatButton = document.getElementById('chatButton');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const sendBtn = document.getElementById('sendBtn');
    const chatInput = document.getElementById('chatInput');
    const autoPlayToggleBtn = document.getElementById('autoPlayToggleBtn');
    const conversationModeBtn = document.getElementById('conversationModeBtn');

    if (chatButton) {
      chatButton.addEventListener('click', () => this.toggleChat());
    }

    if (closeChatBtn) {
      closeChatBtn.addEventListener('click', () => this.closeChat());
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !this.isLoading) {
          this.sendMessage();
        }
      });

      // Stop listening when user starts typing (only if not in conversation mode)
      chatInput.addEventListener('input', () => {
        if (this.isListening && !this.conversationMode) {
          this.stopListening();
        }
      });
    }

    if (autoPlayToggleBtn) {
      autoPlayToggleBtn.addEventListener('click', () => this.toggleAutoPlay());
    }

    if (conversationModeBtn) {
      conversationModeBtn.addEventListener('click', () => this.toggleConversationMode());
    }
  }

  toggleChat() {
    if (this.isOpen) {
      this.closeChat();
    } else {
      this.openChat();
    }
  }

  openChat() {
    const chatPanel = document.getElementById('chatPanel');
    if (chatPanel) {
      chatPanel.style.display = 'flex';
      this.isOpen = true;
      
      // Focus on input
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        setTimeout(() => chatInput.focus(), 100);
      }
    }
  }

  closeChat() {
    const chatPanel = document.getElementById('chatPanel');
    if (chatPanel) {
      chatPanel.style.display = 'none';
      this.isOpen = false;
    }
  }

  addWelcomeMessage() {
    const welcomeMessage = "Hi! I'm Luma, your AI assistant for this event. I can help you find information about schedules, crew assignments, gear lists, travel details, and more. What would you like to know? 📸";
    
    // Add conversation mode hint if speech recognition is supported
    let fullMessage = welcomeMessage;
    if (this.speechRecognition) {
      fullMessage += " You can also enable voice conversation mode to talk to me directly!";
    }
    
    this.addMessage('assistant', fullMessage);
  }

  async sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (!message || this.isLoading) return;

    // Update conversation state to processing
    this.conversationState = 'processing';
    this.updateConversationVisuals();

    // Stop listening and current audio when sending a message
    if (this.isListening) {
      this.stopListening();
    }
    if (this.currentAudio) {
      this.stopCurrentAudio();
    }

    // Add user message to chat
    this.addMessage('user', message);
    chatInput.value = '';

    // Show typing indicator
    this.showTypingIndicator();
    this.isLoading = true;
    this.updateSendButton(false);

    try {
      // Gather additional context about the current page/state
      const pageContext = {
        currentPage: window.location.pathname,
        activeTab: document.querySelector('.tab-button.active')?.textContent?.trim() || null,
        currentView: document.querySelector('.view-container.active')?.id || null,
        browserLanguage: navigator.language || 'en-US',
        conversationMode: this.conversationMode,
        voiceEnabled: this.voiceEnabled,
        messageCount: this.conversationHistory.length,
        isOngoingConversation: this.conversationHistory.length > 0,
        conversationState: this.conversationState
      };

      const response = await fetch(`${this.API_BASE}/api/chat/${this.tableId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token
        },
        body: JSON.stringify({ 
          message,
          conversationHistory: this.conversationHistory,
          pageContext 
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Add user message to conversation history immediately
      this.conversationHistory.push({ role: 'user', content: message });
      
      // Remove typing indicator and prepare for streaming response
      this.hideTypingIndicator();
      
      // Create message container for streaming response
      const messageContainer = this.addStreamingMessage('assistant');
      
      // Handle streaming response
      await this.handleStreamingResponse(response, messageContainer);

    } catch (error) {
      console.error('Chat error:', error);
      this.hideTypingIndicator();
      
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      
      if (error.message.includes('401')) {
        errorMessage = 'Authentication error. Please refresh the page and try again.';
      } else if (error.message.includes('429')) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (error.message.includes('500')) {
        errorMessage = 'Server error. Please try again in a moment.';
      }
      
      this.addMessage('assistant', errorMessage);
    } finally {
      this.isLoading = false;
      this.updateSendButton(true);
      
      // Update conversation state back to idle if not in voice mode
      if (this.conversationState === 'processing' && (!this.voiceEnabled || !this.autoPlayVoice)) {
        this.conversationState = 'idle';
        this.updateConversationVisuals();
        
        // Resume listening in conversation mode after a brief delay
        if (this.conversationMode && this.speechEnabled) {
          setTimeout(() => {
            if (!this.isListening && this.conversationMode && this.speechEnabled) {
              this.startListening();
            }
          }, 1000);
        }
      }
      // If voice is enabled and auto-play is on, the state will be managed by playVoice/handleAudioEnded
    }
  }

  addMessage(sender, content) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    const senderLabel = sender === 'user' ? 'You' : 'Luma';
    
    messageDiv.innerHTML = `
      <div class="message-sender">${senderLabel}</div>
      <div class="message-content">${this.formatMessage(content)}</div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv;
  }

  addStreamingMessage(sender) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return null;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    const senderLabel = sender === 'user' ? 'You' : 'Luma';
    
    messageDiv.innerHTML = `
      <div class="message-sender">${senderLabel}</div>
      <div class="message-content"></div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv.querySelector('.message-content');
  }

  async handleStreamingResponse(response, messageContainer) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.error) {
                messageContainer.innerHTML = `<span style="color: #cc0007;">${data.error}</span>`;
                return;
              }
              
              if (data.content) {
                fullResponse += data.content;
                messageContainer.innerHTML = this.formatMessage(fullResponse) + '<span class="typing-cursor">|</span>';
                
                // Auto-scroll to bottom
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
              }
              
              if (data.done) {
                // Remove typing cursor and finalize message
                messageContainer.innerHTML = this.formatMessage(fullResponse);
                
                // Add to conversation history
                this.conversationHistory.push({ role: 'assistant', content: fullResponse });
                
                // Keep only last 20 messages to avoid memory issues
                if (this.conversationHistory.length > 20) {
                  this.conversationHistory = this.conversationHistory.slice(-20);
                }

                // Add voice controls and auto-play if enabled
                this.addVoiceControls(messageContainer.parentElement, fullResponse);
                
                return;
              }
            } catch (parseError) {
              console.error('Error parsing streaming data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      messageContainer.innerHTML = '<span style="color: #cc0007;">Connection error. Please try again.</span>';
    }
  }

  formatMessage(content) {
    // Enhanced formatting for better readability
    return content
      // Handle line breaks and paragraphs
      .replace(/\n\n/g, '</p><p>') // Double line breaks = new paragraph
      .replace(/\n/g, '<br>') // Single line breaks = line break
      
      // Format markdown-style text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
      
      // Format lists
      .replace(/^• (.+)$/gm, '<li>$1</li>') // Bullet points
      .replace(/^- (.+)$/gm, '<li>$1</li>') // Dashes as bullets
      .replace(/^(\d+)\. (.+)$/gm, '<li>$1. $2</li>') // Numbered lists
      
      // Wrap consecutive list items in ul tags
      .replace(/(<li>.*<\/li>)(\s*<br>\s*<li>.*<\/li>)*/g, (match) => {
        return '<ul>' + match.replace(/<br>\s*/g, '') + '</ul>';
      })
      
      // Format times (make them more readable)
      .replace(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi, '<span class="time">$1:$2 $3</span>')
      
      // Format dates
      .replace(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/g, '<span class="date">$1 $2, $3</span>')
      
      // Add paragraph wrapper if content doesn't start with a tag
      .replace(/^(?!<[^>]+>)(.+)/, '<p>$1')
      .replace(/(.+)(?!<\/[^>]+>)$/, '$1</p>')
      
      // Clean up any double paragraph tags
      .replace(/<p><\/p>/g, '')
      .replace(/<p>\s*<\/p>/g, '');
  }

  showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
      Assistant is typing
      <div class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;

    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  updateSendButton(enabled) {
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
      sendBtn.disabled = !enabled;
    }
  }



  toggleAutoPlay() {
    this.autoPlayVoice = !this.autoPlayVoice;
    localStorage.setItem('lumaAutoPlayVoice', this.autoPlayVoice.toString());
    
    const autoPlayToggleBtn = document.getElementById('autoPlayToggleBtn');
    if (autoPlayToggleBtn) {
      const icon = autoPlayToggleBtn.querySelector('.material-symbols-outlined');
      icon.textContent = this.autoPlayVoice ? 'play_circle' : 'pause_circle';
      autoPlayToggleBtn.className = `auto-play-toggle-btn ${this.autoPlayVoice ? 'active' : ''}`;
      autoPlayToggleBtn.title = this.autoPlayVoice ? 'Auto-play enabled' : 'Auto-play disabled';
    }

    console.log('Auto-play', this.autoPlayVoice ? 'enabled' : 'disabled');
  }

  preprocessTextForVoice(text) {
    // Very minimal text preprocessing for voice synthesis
    let processedText = text;
    
    // In conversation mode, remove redundant introductions after the first message
    if (this.conversationMode && this.conversationHistory.length > 1) {
      processedText = processedText
        .replace(/^Hi! I'm Luma, your A I assistant[^.]*\.\s*/g, '')
        .replace(/^Hello! I'm Luma[^.]*\.\s*/g, '')
        .replace(/^I'm Luma[^.]*\.\s*/g, '')
        .replace(/^Hi there! I'm Luma[^.]*\.\s*/g, '');
    }
    
    // Only fix the absolute most critical abbreviations that sound foreign
    processedText = processedText
      .replace(/\bAI\b/g, 'A I')
      .replace(/\bAPI\b/g, 'A P I')
      .replace(/\bUI\b/g, 'U I')
      .replace(/\bQ&A\b/g, 'Q and A')
      .replace(/\bQnA\b/g, 'Q and A')
      
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    return processedText;
  }

  getOrdinalNumber(num) {
    const ordinals = {
      1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
      6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
      11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
      16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth', 20: 'twentieth',
      21: 'twenty-first', 22: 'twenty-second', 23: 'twenty-third', 24: 'twenty-fourth',
      25: 'twenty-fifth', 26: 'twenty-sixth', 27: 'twenty-seventh', 28: 'twenty-eighth',
      29: 'twenty-ninth', 30: 'thirtieth', 31: 'thirty-first'
    };
    return ordinals[num] || `${num}th`;
  }

  convertYearToSpoken(year) {
    const yearNum = parseInt(year);
    if (yearNum >= 2000 && yearNum < 2010) {
      return `two thousand ${yearNum === 2000 ? '' : this.getOnesDigit(yearNum - 2000)}`.trim();
    } else if (yearNum >= 2010 && yearNum < 2100) {
      const tens = Math.floor((yearNum - 2000) / 10);
      const ones = yearNum % 10;
      return `twenty ${this.getTensDigit(tens)}${ones > 0 ? ' ' + this.getOnesDigit(ones) : ''}`.trim();
    }
    return year; // Fallback for other years
  }

  getTensDigit(num) {
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    return tens[num] || '';
  }

  getOnesDigit(num) {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    return ones[num] || '';
  }

  numberToWords(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (num === 0) return 'Zero';
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) {
      const tenDigit = Math.floor(num / 10);
      const oneDigit = num % 10;
      return tens[tenDigit] + (oneDigit > 0 ? ' ' + ones[oneDigit] : '');
    }
    
    // For numbers 100 and above, just return the original number
    return num.toString();
  }

  async synthesizeVoice(text) {
    if (!this.voiceEnabled || !text.trim()) {
      return null;
    }

    try {
      // Preprocess text for better voice synthesis
      const processedText = this.preprocessTextForVoice(text);
      
      console.log('🎙️ Original text:', text.substring(0, 100) + '...');
      console.log('🎙️ Processed text:', processedText.substring(0, 100) + '...');
      
      const response = await fetch(`${this.API_BASE}/api/voice/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token
        },
        body: JSON.stringify({
          text: processedText, // Use processed text instead of original
          voice: this.voiceId
        })
      });

      if (!response.ok) {
        throw new Error(`Voice synthesis failed: ${response.status}`);
      }

      // Convert response to blob for audio playback
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      return audioUrl;
    } catch (error) {
      console.error('Voice synthesis error:', error);
      return null;
    }
  }

  async playVoice(audioUrl) {
    if (!audioUrl) return;

    try {
      // Stop any currently playing audio
      this.stopCurrentAudio();

      // Update conversation state to speaking
      this.conversationState = 'speaking';
      this.updateConversationVisuals();

      // IMPORTANT: Stop listening while AI is speaking to prevent feedback
      if (this.isListening) {
        this.stopListening();
      }

      // Create new audio element
      this.currentAudio = new Audio(audioUrl);
      
      // Set up audio event listeners
      this.currentAudio.addEventListener('ended', () => {
        console.log('🔊 Voice response finished');
        this.handleAudioEnded();
      });

      this.currentAudio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        this.handleAudioEnded();
      });

      // Enable interruption in conversation mode
      if (this.conversationMode && this.interruptionEnabled) {
        this.setupAudioInterruption();
      }

      // Play the audio
      await this.currentAudio.play();
      console.log('🔊 Playing voice response');

    } catch (error) {
      console.error('Audio playback failed:', error);
      this.handleAudioEnded();
    }
  }

  setupAudioInterruption() {
    // Simplified interruption - just allow manual stopping via conversation button
    // No automatic speech detection during AI playback to prevent feedback loops
    console.log('🔇 Audio interruption setup - manual control only');
  }

  handleAudioEnded() {
    // Clean up audio
    this.cleanupAudio();

    // Update conversation state back to idle
    this.conversationState = 'idle';
    this.updateConversationVisuals();

    // In conversation mode, automatically restart listening after AI finishes speaking
    // Use longer delay to ensure AI voice has completely stopped and won't be picked up
    if (this.conversationMode && this.speechEnabled) {
      setTimeout(() => {
        if (this.conversationMode && !this.isListening && !this.currentAudio) {
          console.log('🎤 Auto-restarting listening after AI response');
          this.startListening();
        }
      }, 1500); // Longer delay to prevent feedback
    }
  }

  stopCurrentAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.cleanupAudio();
    }
  }

  cleanupAudio() {
    if (this.currentAudio) {
      // Revoke the object URL to free memory
      if (this.currentAudio.src && this.currentAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.currentAudio.src);
      }
      this.currentAudio = null;
    }
  }

  addVoiceControls(messageDiv, text) {
    if (!this.voiceEnabled) return;

    const voiceControlsDiv = document.createElement('div');
    voiceControlsDiv.className = 'voice-controls';
    
    const playButton = document.createElement('button');
    playButton.className = 'voice-play-btn';
    playButton.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    playButton.title = 'Play voice response';
    
    const playVoiceFunction = async () => {
      if (playButton.classList.contains('loading')) return;

      // Stop listening while playing voice response
      const wasListening = this.isListening;
      if (this.isListening) {
        this.stopListening();
      }

      playButton.classList.add('loading');
      playButton.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span>';
      
      const audioUrl = await this.synthesizeVoice(text);
      
      playButton.classList.remove('loading');
      
      if (audioUrl) {
        playButton.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
        
        // Set up audio end callback to resume listening
        const originalAudio = this.currentAudio;
        await this.playVoice(audioUrl);
        
        // Resume listening after voice response if we were listening before
        if (wasListening && this.conversationMode && this.speechEnabled) {
          setTimeout(() => {
            if (!this.isListening && this.conversationMode && this.speechEnabled) {
              this.startListening();
            }
          }, 500);
        }
        
        playButton.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
      } else {
        playButton.innerHTML = '<span class="material-symbols-outlined">error</span>';
        setTimeout(() => {
          playButton.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
          
          // Resume listening even if voice synthesis failed
          if (wasListening && this.conversationMode && this.speechEnabled) {
            setTimeout(() => {
              if (!this.isListening && this.conversationMode && this.speechEnabled) {
                this.startListening();
              }
            }, 500);
          }
        }, 2000);
      }
    };
    
    playButton.addEventListener('click', playVoiceFunction);

    voiceControlsDiv.appendChild(playButton);
    messageDiv.appendChild(voiceControlsDiv);

    // Auto-play if voice and auto-play are both enabled
    if (this.voiceEnabled && this.autoPlayVoice) {
      // Add a small delay to ensure the message is fully rendered
      setTimeout(() => {
        playVoiceFunction();
      }, 100);
    }
  }

  destroy() {
    if (this.speechRecognition && this.isListening) {
      this.stopListening();
    }
    
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    
    this.cleanupAudio();
    
    const chatButton = document.getElementById('chatButton');
    const chatPanel = document.getElementById('chatPanel');
    
    if (chatButton) chatButton.remove();
    if (chatPanel) chatPanel.remove();
    
    console.log('Chat widget destroyed');
  }

  initializeSpeechRecognition() {
    // Check if browser supports speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.speechRecognition = new SpeechRecognition();
      
      // Configure for conversation mode
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-US';
      this.speechRecognition.maxAlternatives = 1;
      
      this.speechRecognition.onstart = () => {
        console.log('🎤 Speech recognition started');
        this.conversationState = 'listening';
        this.updateConversationVisuals();
      };
      
      this.speechRecognition.onresult = (event) => {
        this.handleSpeechResult(event);
      };
      
      this.speechRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access and try again.');
        }
        this.handleSpeechEnd();
      };
      
      this.speechRecognition.onend = () => {
        console.log('🎤 Speech recognition ended');
        this.handleSpeechEnd();
      };

      // Show the conversation mode button now that speech recognition is available
      this.showConversationModeButton();
      console.log('🎤 Speech recognition initialized successfully');
    } else {
      console.log('Speech recognition not supported in this browser');
      this.hideConversationModeButton();
    }
  }

  handleSpeechResult(event) {
    // Don't process speech if AI is currently speaking to prevent feedback
    if (this.currentAudio && !this.currentAudio.paused) {
      console.log('🔇 Ignoring speech while AI is speaking to prevent feedback');
      return;
    }
    
    let finalTranscript = '';
    let interimTranscript = '';
    
    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    
    // Filter out potential AI voice feedback
    const combinedTranscript = finalTranscript + interimTranscript;
    if (this.isLikelyAIFeedback(combinedTranscript)) {
      console.log('🔇 Filtering out potential AI feedback:', combinedTranscript.trim());
      return;
    }
    
    // Update input field with current transcript
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      const fullTranscript = this.speechBuffer + finalTranscript + interimTranscript;
      chatInput.value = fullTranscript;
    }
    
    // Handle final results
    if (finalTranscript.trim()) {
      this.speechBuffer += finalTranscript;
      this.lastSpeechTime = Date.now();
      
      // Reset voice activity timer
      this.resetVoiceActivityTimer();
      
      console.log('🎤 Final transcript:', finalTranscript.trim());
    }
    
    // Handle interim results for voice activity detection
    if (interimTranscript.trim()) {
      this.lastSpeechTime = Date.now();
      this.resetVoiceActivityTimer();
    }
  }

  isLikelyAIFeedback(transcript) {
    const text = transcript.toLowerCase().trim();
    
    // Filter out very short transcripts that are likely noise/feedback
    if (text.length < 3) return true;
    
    // Filter out common AI response patterns that might be picked up
    const aiPatterns = [
      'hi i\'m luma',
      'i\'m luma',
      'luma',
      'assistant',
      'i can help',
      'what would you like',
      'how can i help',
      'let me help',
      'sure',
      'okay',
      'alright',
      'yes',
      'no problem'
    ];
    
    // Check if transcript matches common AI patterns (might be feedback)
    for (const pattern of aiPatterns) {
      if (text.includes(pattern)) {
        return true;
      }
    }
    
    // Filter out single words that are likely feedback
    const words = text.split(/\s+/);
    if (words.length === 1 && words[0].length < 4) {
      return true;
    }
    
    return false;
  }

  resetVoiceActivityTimer() {
    // Clear existing timer
    if (this.voiceActivityTimer) {
      clearTimeout(this.voiceActivityTimer);
    }
    
    // Only set timer in conversation mode
    if (!this.conversationMode) return;
    
    // Set new timer for silence detection
    this.voiceActivityTimer = setTimeout(() => {
      this.handleSilenceDetected();
    }, this.maxSilenceDuration);
  }

  handleSilenceDetected() {
    const speechText = this.speechBuffer.trim();
    
    // Additional checks to prevent processing AI feedback
    if (speechText.length >= 3 && 
        this.conversationState === 'listening' && 
        !this.isLikelyAIFeedback(speechText) &&
        !this.currentAudio) {
      console.log('🔇 Silence detected, processing speech:', speechText);
      this.processSpeechInput(speechText);
    } else if (this.isLikelyAIFeedback(speechText)) {
      console.log('🔇 Ignoring potential AI feedback during silence detection:', speechText);
      this.speechBuffer = ''; // Clear the buffer
    }
  }

  async processSpeechInput(text) {
    // Update conversation state
    this.conversationState = 'processing';
    this.updateConversationVisuals();
    
    // Stop listening temporarily
    this.stopListening();
    
    // Clear speech buffer
    this.speechBuffer = '';
    
    // Update input field and send message
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = text;
    }
    
    // Send the message
    await this.sendMessage();
  }

  handleSpeechEnd() {
    this.isListening = false;
    
    // Clear timers
    if (this.voiceActivityTimer) {
      clearTimeout(this.voiceActivityTimer);
      this.voiceActivityTimer = null;
    }
    
    // Auto-restart in conversation mode if not processing
    if (this.conversationMode && this.speechEnabled && this.conversationState !== 'processing' && this.conversationState !== 'speaking') {
      setTimeout(() => {
        if (this.conversationMode && !this.isListening && !this.currentAudio) {
          console.log('🎤 Auto-restarting speech recognition in conversation mode');
          this.startListening();
        }
      }, 500);
    } else if (this.conversationState === 'listening') {
      this.conversationState = 'idle';
      this.updateConversationVisuals();
    }
  }

  showConversationModeButton() {
    const conversationModeBtn = document.getElementById('conversationModeBtn');
    if (conversationModeBtn) {
      conversationModeBtn.style.display = 'flex';
      this.updateConversationModeButton();
    }
  }

  hideConversationModeButton() {
    const conversationModeBtn = document.getElementById('conversationModeBtn');
    if (conversationModeBtn) {
      conversationModeBtn.style.display = 'none';
    }
  }



  updateAutoPlayButton() {
    const autoPlayToggleBtn = document.getElementById('autoPlayToggleBtn');
    if (autoPlayToggleBtn) {
      const icon = autoPlayToggleBtn.querySelector('.material-symbols-outlined');
      icon.textContent = this.autoPlayVoice ? 'play_circle' : 'pause_circle';
      autoPlayToggleBtn.className = `auto-play-toggle-btn ${this.autoPlayVoice ? 'active' : ''}`;
      autoPlayToggleBtn.title = this.autoPlayVoice ? 'Auto-play enabled' : 'Auto-play disabled';
      autoPlayToggleBtn.style.display = this.voiceEnabled ? 'flex' : 'none';
    }
  }

  updateConversationModeButton() {
    const conversationModeBtn = document.getElementById('conversationModeBtn');
    if (conversationModeBtn) {
      const icon = conversationModeBtn.querySelector('.material-symbols-outlined');
      
      if (this.conversationMode) {
        // Show different icons based on conversation state
        switch (this.conversationState) {
          case 'listening':
            icon.textContent = 'mic';
            conversationModeBtn.title = 'Voice conversation active - Listening';
            break;
          case 'processing':
            icon.textContent = 'psychology';
            conversationModeBtn.title = 'Voice conversation active - Processing';
            break;
          case 'speaking':
            icon.textContent = 'record_voice_over';
            conversationModeBtn.title = 'Voice conversation active - Speaking';
            break;
          default:
            icon.textContent = 'record_voice_over';
            conversationModeBtn.title = 'Voice conversation active';
        }
        conversationModeBtn.className = `conversation-mode-btn active ${this.conversationState}`;
      } else {
        icon.textContent = 'voice_over_off';
        conversationModeBtn.className = 'conversation-mode-btn';
        conversationModeBtn.title = 'Start voice conversation';
      }
    }
  }

  updateChatPanelVisuals() {
    const chatPanel = document.getElementById('chatPanel');
    if (chatPanel) {
      if (this.conversationMode) {
        chatPanel.classList.add('conversation-mode');
      } else {
        chatPanel.classList.remove('conversation-mode');
      }
    }
  }

  toggleConversationMode() {
    if (!this.speechRecognition) {
      alert('Voice conversation is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    // If conversation mode is active and AI is speaking, allow interruption
    if (this.conversationMode && this.conversationState === 'speaking') {
      console.log('🔇 User interrupted AI response via button');
      this.stopCurrentAudio();
      this.startListening();
      return;
    }

    this.conversationMode = !this.conversationMode;
    localStorage.setItem('lumaConversationMode', this.conversationMode.toString());

    if (this.conversationMode) {
      // Automatically enable speech recognition and voice when starting conversation mode
      this.speechEnabled = true;
      localStorage.setItem('lumaSpeechEnabled', 'true');
      
      // Enable voice and auto-play for better conversation experience
      if (!this.voiceEnabled) {
        this.voiceEnabled = true;
        localStorage.setItem('lumaVoiceEnabled', 'true');
      }
      
      if (!this.autoPlayVoice) {
        this.autoPlayVoice = true;
        localStorage.setItem('lumaAutoPlayVoice', 'true');
        this.updateAutoPlayButton();
      }

      // Start listening immediately
      this.startListening();
      console.log('🎙️ Voice conversation mode enabled - Ready to listen!');
    } else {
      // Stop listening and any audio when leaving conversation mode
      this.stopListening();
      this.stopCurrentAudio();
      this.conversationState = 'idle';
      console.log('🔇 Voice conversation mode disabled');
    }

    this.updateConversationModeButton();
    this.updateConversationVisuals();
  }



  updateConversationVisuals() {
    const chatPanel = document.getElementById('chatPanel');
    const chatInput = document.getElementById('chatInput');
    
    if (chatPanel) {
      // Remove all state classes
      chatPanel.classList.remove('listening', 'processing', 'speaking');
      
      if (this.conversationMode) {
        chatPanel.classList.add('conversation-mode');
        
        // Add current state class
        switch (this.conversationState) {
          case 'listening':
            chatPanel.classList.add('listening');
            break;
          case 'processing':
            chatPanel.classList.add('processing');
            break;
          case 'speaking':
            chatPanel.classList.add('speaking');
            break;
        }
      } else {
        chatPanel.classList.remove('conversation-mode');
      }
    }
    
    // Update input field visual feedback
    if (chatInput) {
      chatInput.classList.remove('listening');
      
      if (this.conversationState === 'listening') {
        chatInput.classList.add('listening');
      }
    }
    
    this.updateConversationModeButton();
  }

  startListening() {
    if (!this.speechRecognition || this.isListening) return;

    // Don't start listening if audio is currently playing
    if (this.currentAudio && !this.currentAudio.paused) {
      console.log('🔇 Not starting speech recognition - audio is playing');
      return;
    }

    try {
      this.speechRecognition.start();
      this.isListening = true;
      this.conversationState = 'listening';
      console.log('🎤 Started listening...');
    } catch (error) {
      console.error('Error starting speech recognition:', error);
    }
  }

  stopListening() {
    if (!this.speechRecognition || !this.isListening) return;

    try {
      this.speechRecognition.stop();
      this.isListening = false;
      
      // Clear timers
      if (this.voiceActivityTimer) {
        clearTimeout(this.voiceActivityTimer);
        this.voiceActivityTimer = null;
      }
      
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      
      console.log('🎤 Stopped listening');
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
    }
  }
}

// Global function to initialize chat
window.initChat = function(tableId) {
  // Clean up existing chat widget
  if (window.chatWidget) {
    window.chatWidget.destroy();
    window.chatWidget = null;
  }
  
  if (tableId) {
    window.chatWidget = new ChatWidget(tableId);
  }
};

// Auto-initialize if tableId is available
document.addEventListener('DOMContentLoaded', function() {
  // Try to get tableId from various sources
  const tableId = window.currentTableId || 
                  new URLSearchParams(window.location.search).get('id') ||
                  (window.location.hash && window.location.hash.includes('#') ? 
                   window.location.hash.split('/')[1] : null);
  
  if (tableId) {
    window.initChat(tableId);
  }
});