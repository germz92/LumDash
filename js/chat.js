// AI Chat Widget JavaScript
class ChatWidget {
  constructor(tableId) {
    this.tableId = tableId;
    this.isOpen = false;
    this.isLoading = false;
    this.token = localStorage.getItem('token');
    this.API_BASE = window.API_BASE || '';
    this.conversationHistory = []; // Store conversation for context
    
    // Voice functionality
    this.isListening = false;
    this.isSpeaking = false;
    this.speechRecognition = null;
    this.speechSynthesis = window.speechSynthesis;
    this.initVoiceSupport();
    
    this.init();
  }

  init() {
    // Load chat HTML and CSS if not already loaded
    this.loadChatComponents().then(() => {
      this.setupEventListeners();
      this.addWelcomeMessage();
    });
  }

  initVoiceSupport() {
    // Ensure voices are loaded for speech synthesis
    if (this.speechSynthesis) {
      // Load voices if not already loaded
      if (this.speechSynthesis.getVoices().length === 0) {
        this.speechSynthesis.addEventListener('voiceschanged', () => {
          console.log('Available voices:', this.speechSynthesis.getVoices().map(v => v.name));
        });
      }
    }
    
    // Check for speech recognition support
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.speechRecognition = new SpeechRecognition();
      
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = false;
      this.speechRecognition.lang = 'en-US';
      
      this.speechRecognition.onstart = () => {
        this.isListening = true;
        this.updateVoiceButton(true);
      };
      
      this.speechRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
          chatInput.value = transcript;
          // Auto-send the message
          this.sendMessage();
        }
      };
      
      this.speechRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.stopListening();
      };
      
      this.speechRecognition.onend = () => {
        this.stopListening();
      };
    }
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
        <span class="material-symbols-outlined">smart_toy</span>
      </div>
      <div id="chatPanel" class="chat-panel">
        <div class="chat-header">
          <div class="chat-header-left">
            <strong>Luma</strong>
            <span class="chat-subtitle">AI Assistant</span>
          </div>
          <div class="chat-header-controls">
            <button id="speakerBtn" class="voice-control-btn" title="Toggle speech">
              <span class="material-symbols-outlined">volume_up</span>
            </button>
            <button id="closeChatBtn" class="close-chat-btn">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div id="chatMessages" class="chat-messages"></div>
        <div class="chat-input-container">
          <button id="voiceBtn" class="voice-btn" title="Speak your message">
            <span class="material-symbols-outlined">mic</span>
          </button>
          <input id="chatInput" type="text" placeholder="Ask about this event or click mic to speak..." class="chat-input">
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
    const voiceBtn = document.getElementById('voiceBtn');
    const speakerBtn = document.getElementById('speakerBtn');

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
    }

    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => this.toggleVoiceInput());
    }

    if (speakerBtn) {
      speakerBtn.addEventListener('click', () => this.toggleSpeaker());
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
    const eventTitle = document.getElementById('eventTitle')?.textContent || 'this event';
    const welcomeMessage = `Hi! I'm Luma, your AI assistant for ${eventTitle}. I can help you find information about schedules, crew assignments, gear lists, travel details, and more. What would you like to know? 📸`;
    this.addMessage('assistant', welcomeMessage);
    
    // Add welcome message to conversation history
    this.conversationHistory.push({ role: 'assistant', content: welcomeMessage });
  }

  async sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (!message || this.isLoading) return;

    // Add user message to chat
    this.addMessage('user', message);
    chatInput.value = '';

    // Show typing indicator
    this.showTypingIndicator();
    this.isLoading = true;
    this.updateSendButton(false);

    try {
      const response = await fetch(`${this.API_BASE}/api/chat/${this.tableId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token
        },
        body: JSON.stringify({ 
          message,
          conversationHistory: this.conversationHistory 
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Add to conversation history for context
      this.conversationHistory.push({ role: 'user', content: message });
      this.conversationHistory.push({ role: 'assistant', content: data.response });
      
      // Keep only last 20 messages to avoid memory issues
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }
      
      // Remove typing indicator and add response
      this.hideTypingIndicator();
      this.addMessage('assistant', data.response);
      
      // Speak the response if speaker is enabled
      this.speakResponse(data.response);

    } catch (error) {
      console.error('Chat error:', error);
      this.hideTypingIndicator();
      
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage = 'Please log in to use the chat feature.';
      } else if (error.message.includes('404')) {
        errorMessage = 'Event not found. Please refresh the page.';
      }
      
      this.addMessage('assistant', errorMessage);
    } finally {
      this.isLoading = false;
      this.updateSendButton(true);
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
  }

  formatMessage(content) {
    // Basic formatting for AI responses
    return content
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
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

  // Voice control methods
  toggleVoiceInput() {
    if (!this.speechRecognition) {
      this.showVoiceError('Speech recognition not supported in this browser');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startListening() {
    if (!this.speechRecognition || this.isListening) return;
    
    try {
      this.speechRecognition.start();
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.placeholder = 'Listening... Speak now';
      }
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.showVoiceError('Could not start voice recognition');
    }
  }

  stopListening() {
    this.isListening = false;
    this.updateVoiceButton(false);
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.placeholder = 'Ask about this event or click mic to speak...';
    }
  }

  updateVoiceButton(isListening) {
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
      const icon = voiceBtn.querySelector('.material-symbols-outlined');
      if (isListening) {
        icon.textContent = 'mic_off';
        voiceBtn.classList.add('listening');
        voiceBtn.title = 'Stop listening';
      } else {
        icon.textContent = 'mic';
        voiceBtn.classList.remove('listening');
        voiceBtn.title = 'Speak your message';
      }
    }
  }

  toggleSpeaker() {
    const speakerBtn = document.getElementById('speakerBtn');
    const icon = speakerBtn?.querySelector('.material-symbols-outlined');
    
    if (this.isSpeaking) {
      // Stop current audio playback
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
      
      // Also cancel browser speech synthesis as fallback
      if (this.speechSynthesis) {
        this.speechSynthesis.cancel();
      }
      
      this.isSpeaking = false;
      if (icon) {
        icon.textContent = 'volume_up';
        speakerBtn.classList.remove('speaking');
        speakerBtn.title = 'Enable speech';
      }
    } else {
      // Toggle speaker preference
      const isEnabled = localStorage.getItem('lumaVoiceEnabled') === 'true';
      localStorage.setItem('lumaVoiceEnabled', !isEnabled);
      
      if (icon) {
        icon.textContent = !isEnabled ? 'volume_up' : 'volume_off';
        speakerBtn.classList.toggle('voice-enabled', !isEnabled);
        speakerBtn.title = !isEnabled ? 'Disable speech' : 'Enable speech';
      }
    }
  }

  async speakResponse(text) {
    const isVoiceEnabled = localStorage.getItem('lumaVoiceEnabled') === 'true';
    if (!isVoiceEnabled) return;

    console.log('🎙️ Speaking response with OpenAI TTS:', text.substring(0, 50) + '...');

    try {
      // Set speaking state
      this.isSpeaking = true;
      const speakerBtn = document.getElementById('speakerBtn');
      if (speakerBtn) {
        speakerBtn.classList.add('speaking');
      }

      // Call OpenAI TTS API
      console.log('📡 Calling TTS API:', `${this.API_BASE}/api/tts/${this.tableId}`);
      const response = await fetch(`${this.API_BASE}/api/tts/${this.tableId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        console.error('❌ TTS API error:', response.status, response.statusText);
        throw new Error(`TTS API error: ${response.status}`);
      }

      console.log('✅ TTS API success, creating audio...');
      
      // Get audio blob and play it
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        this.isSpeaking = false;
        if (speakerBtn) {
          speakerBtn.classList.remove('speaking');
        }
        URL.revokeObjectURL(audioUrl); // Clean up
      };

      audio.onerror = (error) => {
        console.error('Audio playback error:', error);
        this.isSpeaking = false;
        if (speakerBtn) {
          speakerBtn.classList.remove('speaking');
        }
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();

    } catch (error) {
      console.error('❌ TTS error, falling back to browser voice:', error);
      this.isSpeaking = false;
      const speakerBtn = document.getElementById('speakerBtn');
      if (speakerBtn) {
        speakerBtn.classList.remove('speaking');
      }
      
      // Fallback to browser TTS if OpenAI TTS fails
      console.log('🔄 Using browser fallback voice...');
      this.fallbackSpeakResponse(text);
    }
  }

  // Fallback to browser speech synthesis if OpenAI TTS fails
  fallbackSpeakResponse(text) {
    if (!this.speechSynthesis) return;

    // Clean text for speech (remove emojis and markdown)
    const cleanText = text.replace(/[📸📅👥📷💾🗺️✈️✅]/g, '').replace(/\*\*/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.85;
    utterance.pitch = 0.95;
    utterance.volume = 0.8;
    
    utterance.onstart = () => {
      this.isSpeaking = true;
      const speakerBtn = document.getElementById('speakerBtn');
      if (speakerBtn) {
        speakerBtn.classList.add('speaking');
      }
    };
    
    utterance.onend = () => {
      this.isSpeaking = false;
      const speakerBtn = document.getElementById('speakerBtn');
      if (speakerBtn) {
        speakerBtn.classList.remove('speaking');
      }
    };

    this.speechSynthesis.speak(utterance);
  }

  showVoiceError(message) {
    this.addMessage('assistant', `🎤 ${message}`);
  }

  destroy() {
    // Remove chat elements from DOM
    const chatButton = document.getElementById('chatButton');
    const chatPanel = document.getElementById('chatPanel');
    
    if (chatButton) chatButton.remove();
    if (chatPanel) chatPanel.remove();
    
    // Remove chat CSS if no other instance needs it
    const chatCss = document.querySelector('link[href*="chat.css"]');
    if (chatCss) chatCss.remove();
    
    console.log('Chat widget destroyed');
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