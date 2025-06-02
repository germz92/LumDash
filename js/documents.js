// IMMEDIATE DEBUG: Check if script is executing
console.log('🔥 documents.js STARTING TO EXECUTE');
console.log('🔥 Current timestamp:', new Date().toISOString());

// Set a marker to confirm script execution
window.__documentsJsLoaded = true;

// Check for any potential blocking issues
try {
  console.log('🔥 API_BASE available:', typeof API_BASE !== 'undefined' ? API_BASE : 'UNDEFINED');
  console.log('🔥 window.API_BASE available:', typeof window.API_BASE !== 'undefined' ? window.API_BASE : 'UNDEFINED');
  console.log('🔥 localStorage available:', typeof localStorage !== 'undefined');
  
  // Ensure API_BASE is available globally
  if (typeof API_BASE === 'undefined' && typeof window.API_BASE !== 'undefined') {
    window.API_BASE = window.API_BASE;
    console.log('🔥 Set API_BASE from window.API_BASE');
  }
  
  if (typeof API_BASE === 'undefined' && typeof window.API_BASE === 'undefined') {
    console.error('🔥 CRITICAL: API_BASE is not available!');
    // Set a fallback
    window.API_BASE = 'http://localhost:3000';
    console.log('🔥 Set fallback API_BASE');
  }
  
} catch (e) {
  console.error('🔥 Error checking dependencies:', e);
}

// Clear any existing initPage function to prevent conflicts with other pages
// window.initPage = null; // Removed - this was interfering with function definition

try {
  console.log('🔥 Starting class and function definitions...');

class DocumentsPage {
  constructor() {
    this.currentDocument = null;
    this.eventId = localStorage.getItem('eventId');
    this.isOwner = false; // Track owner status
    this.zoomLevel = 1;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.imagePosition = { x: 0, y: 0 };
    this.init();
  }

  init() {
    this.checkOwnerStatus();
    this.setupEventListeners();
    this.loadDocuments();
  }

  async checkOwnerStatus() {
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');
      
      if (!token || !userId) {
        console.log('No token or userId found');
        this.isOwner = false;
        return;
      }

      const apiBase = window.API_BASE || API_BASE || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/api/tables/${this.eventId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch table data for owner check');
        this.isOwner = false;
        return;
      }

      const table = await response.json();
      this.isOwner = Array.isArray(table.owners) && table.owners.includes(userId);
      
      console.log('Owner status checked:', {
        userId,
        tableOwners: table.owners,
        isOwner: this.isOwner
      });

      // Update UI based on owner status
      this.updateUIForOwnerStatus();
      
    } catch (error) {
      console.error('Error checking owner status:', error);
      this.isOwner = false;
    }
  }

  updateUIForOwnerStatus() {
    const uploadSection = document.querySelector('.upload-section');
    const uploadNewButton = document.querySelector('.btn-upload-new');
    
    if (!this.isOwner) {
      // Hide upload section for non-owners
      if (uploadSection) {
        uploadSection.style.display = 'none';
      }
      
      // Hide upload new button for non-owners
      if (uploadNewButton) {
        uploadNewButton.style.display = 'none';
      }
    } else {
      // Show upload section for owners
      if (uploadSection) {
        uploadSection.style.display = 'block';
      }
      
      // Show upload new button for owners
      if (uploadNewButton) {
        uploadNewButton.style.display = 'block';
      }
    }
  }

  setupEventListeners() {
    // Upload area events
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    if (!uploadArea || !fileInput) {
      console.error('Upload area or file input not found!');
      return;
    }

    // Handle click events for both desktop and mobile
    const handleUploadAreaClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Check if user is owner before allowing file selection
      if (!this.isOwner) {
        this.showError('Only event owners can upload maps');
        return;
      }
      
      console.log('Upload area clicked, triggering file input');
      fileInput.click();
    };

    // Add both click and touchend events for better mobile support
    uploadArea.addEventListener('click', handleUploadAreaClick);
    uploadArea.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleUploadAreaClick(e);
    });

    // Drag and drop events
    uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
    uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
    uploadArea.addEventListener('drop', this.handleDrop.bind(this));

    // File input change event
    fileInput.addEventListener('change', (e) => {
      console.log('File input changed, files:', e.target.files.length);
      if (e.target.files.length > 0) {
        this.uploadFile(e.target.files[0]);
      }
    });

    // Modal events
    const closeModal = document.getElementById('closeModal');
    const modalOverlay = document.getElementById('modalOverlay');

    if (closeModal) closeModal.addEventListener('click', this.closeModal.bind(this));
    if (modalOverlay) modalOverlay.addEventListener('click', this.closeModal.bind(this));

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('documentModal').style.display !== 'none') {
        if (e.key === 'Escape') this.closeModal();
      }
    });
  }

  handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
  }

  handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    // Check if user is owner before allowing file drops
    if (!this.isOwner) {
      this.showError('Only event owners can upload maps');
      return;
    }
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.uploadFile(files[0]);
    }
  }

  async uploadFile(file) {
    // Check if user is owner before allowing upload
    if (!this.isOwner) {
      this.showError('Only event owners can upload maps');
      return;
    }

    // Validate file
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    
    console.log('Uploading file:', file.name, 'Type:', file.type, 'Size:', file.size);
    
    if (file.size > maxSize) {
      this.showError('File size must be less than 10MB');
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      this.showError('Only PDF, JPG, and PNG files are allowed');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('eventId', this.eventId);

    this.showUploadProgress();

    try {
      const token = localStorage.getItem('token');
      console.log('Upload token exists:', token ? 'YES' : 'NO');
      
      const apiBase = window.API_BASE || API_BASE || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/api/tables/${this.eventId}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      console.log('Upload response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Upload error response:', errorText);
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('Upload successful:', result);
      this.hideUploadProgress();
      this.showSuccess('Map uploaded successfully');
      this.loadDocuments();
      
      // Reset file input
      document.getElementById('fileInput').value = '';
      
    } catch (error) {
      console.error('Upload error:', error);
      this.hideUploadProgress();
      this.showError('Failed to upload map: ' + error.message);
    }
  }

  showUploadProgress() {
    document.getElementById('uploadProgress').style.display = 'block';
    // Simulate progress for now - in a real implementation, you'd track actual progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      document.getElementById('progressFill').style.width = progress + '%';
      if (progress >= 90) {
        clearInterval(interval);
      }
    }, 100);
  }

  hideUploadProgress() {
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('progressFill').style.width = '0%';
  }

  async loadDocuments() {
    console.log('Loading documents with token:', localStorage.getItem('token') ? 'EXISTS' : 'MISSING');
    console.log('EventId:', this.eventId);
    console.log('API_BASE:', window.API_BASE || API_BASE);
    
    // Add debugging for timing
    console.log('loadDocuments called at:', new Date().toISOString());
    
    try {
      const apiBase = window.API_BASE || API_BASE || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/api/tables/${this.eventId}/documents`, {
        headers: {
          'Authorization': localStorage.getItem('token')
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const documents = await response.json();
      console.log('Loaded documents:', documents.length);
      console.log('Documents data:', documents);
      
      this.renderDocuments(documents);
      
      // Update UI for owner status after rendering documents
      // This ensures all UI elements exist before we try to modify them
      this.updateUIForOwnerStatus();
      
    } catch (error) {
      console.error('Error loading documents:', error);
      this.showError('Failed to load documents: ' + error.message);
    }
  }

  renderDocuments(documents) {
    const uploadSection = document.querySelector('.upload-section');
    const grid = document.getElementById('documentsGrid');
    
    if (documents.length === 0) {
      // Show upload area when no documents, but only for owners
      if (this.isOwner) {
        uploadSection.style.display = 'block';
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <span class="material-symbols-outlined">map</span>
            <h3>No maps yet</h3>
            <p>Upload your first map to get started</p>
          </div>
        `;
      } else {
        uploadSection.style.display = 'none';
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <span class="material-symbols-outlined">map</span>
            <h3>No maps available</h3>
            <p>No maps have been uploaded for this event yet</p>
          </div>
        `;
      }
      return;
    }

    // Hide upload area when documents exist (will be shown via button for owners)
    uploadSection.style.display = 'none';

    // Show documents prominently with conditional remove button
    grid.innerHTML = documents.map(doc => `
      <div class="document-card-prominent">
        <div class="document-preview-large">
          ${this.getDocumentPreview(doc, true)}
        </div>
        <div class="document-info-prominent">
          <h2 class="document-title-large">${doc.originalName}</h2>
          <div class="document-meta-prominent">
            <span>Uploaded: ${this.formatDate(doc.uploadedAt)}</span>
            <span class="document-size">${this.formatFileSize(doc.size)}</span>
          </div>
          <div class="document-actions">
            <button class="btn-primary" onclick="documentsPage.openDocument('${doc._id}')">
              <span class="material-symbols-outlined">open_in_full</span>
              View Full Screen
            </button>
          </div>
        </div>
        ${this.isOwner ? `
          <button class="remove-file-btn" onclick="documentsPage.deleteDocumentDirect('${doc._id}')" title="Remove file">
            <span class="material-symbols-outlined">close</span>
          </button>
        ` : ''}
      </div>
    `).join('');

    // Add upload new file button at the bottom, but only for owners
    if (this.isOwner) {
      grid.innerHTML += `
        <div class="upload-new-section">
          <button class="btn-upload-new" onclick="documentsPage.showUploadArea()">
            <span class="material-symbols-outlined">add</span>
            Upload Another Map
          </button>
        </div>
      `;
    }
  }

  getDocumentPreview(doc, isLarge = false) {
    const sizeClass = isLarge ? 'large' : '';
    
    if (doc.fileType.startsWith('image/')) {
      return `<img src="${doc.url}" alt="${doc.originalName}" loading="lazy" class="preview-image ${sizeClass}">`;
    } else if (doc.fileType === 'application/pdf') {
      // For PDF preview, show first page as image using PDF.js or embed
      return `
        <div class="pdf-preview ${sizeClass}">
          <embed src="${doc.url}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" class="pdf-embed ${sizeClass}">
          <div class="pdf-fallback">
            <span class="material-symbols-outlined file-icon">picture_as_pdf</span>
            <p>PDF Document</p>
          </div>
        </div>
      `;
    } else {
      return `<span class="material-symbols-outlined file-icon ${sizeClass}">description</span>`;
    }
  }

  async openDocument(documentId) {
    console.log('Opening document with ID:', documentId);
    console.log('Event ID:', this.eventId);
    const apiBase = window.API_BASE || API_BASE || 'http://localhost:3000';
    console.log('API_BASE:', apiBase);
    
    try {
      const token = localStorage.getItem('token');
      console.log('Token exists:', token ? 'YES' : 'NO');
      
      const url = `${apiBase}/api/tables/${this.eventId}/documents/${documentId}`;
      console.log('Fetching document from URL:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to load document: ${response.status} ${errorText}`);
      }

      const documentData = await response.json();
      console.log('Document data received:', documentData);
      
      if (!documentData || !documentData.url) {
        console.error('Invalid document data:', documentData);
        throw new Error('Invalid document data received');
      }
      
      this.currentDocument = documentData;
      this.showDocumentModal(documentData);
      
    } catch (error) {
      console.error('Open document error:', error);
      this.showError('Failed to open map: ' + error.message);
    }
  }

  showDocumentModal(documentData) {
    console.log('Opening document modal for:', documentData);
    
    const modal = document.getElementById('documentModal');
    const title = document.getElementById('documentTitle');
    const viewer = document.getElementById('documentViewer');

    if (!modal || !title || !viewer) {
      console.error('Modal elements not found:', { modal: !!modal, title: !!title, viewer: !!viewer });
      this.showError('Modal elements not found');
      return;
    }

    // Reset zoom state
    this.zoomLevel = 1;
    this.imagePosition = { x: 0, y: 0 };
    this.isDragging = false;

    title.textContent = documentData.originalName;
    
    // Clear previous content
    viewer.innerHTML = '';
    viewer.classList.remove('zoomed');
    
    console.log('Document type:', documentData.fileType);
    console.log('Document URL:', documentData.url);
    
    if (documentData.fileType.startsWith('image/')) {
      console.log('Displaying image');
      viewer.innerHTML = `
        <img id="zoomableImage" 
             src="${documentData.url}" 
             alt="${documentData.originalName}"
             style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: auto; transform-origin: center;"
             onload="console.log('Image loaded successfully'); documentsPage.setupImageZoom();"
             onerror="console.error('Image failed to load'); this.style.display='none'; this.parentNode.innerHTML='<p>Failed to load image</p>';">
      `;
      
      // Show zoom controls for images
      this.showZoomControls(true);
      
    } else if (documentData.fileType === 'application/pdf') {
      console.log('Displaying PDF');
      // Hide zoom controls for PDFs
      this.showZoomControls(false);
      
      // Use direct URL since backend handles inline viewing configuration
      const pdfUrl = documentData.url;
      
      viewer.innerHTML = `
        <div style="width: 100%; height: 100%; position: relative; background: #f0f0f0;">
          <!-- Primary: Object tag with inline PDF -->
          <object id="pdfObject" 
                  data="${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH&pagemode=none" 
                  type="application/pdf" 
                  style="width: 100%; height: 100%; border: none; display: block;"
                  onload="console.log('PDF object loaded'); document.getElementById('pdfLoading').style.display='none';"
                  onerror="this.style.display='none'; document.getElementById('pdfFallback').style.display='block'; document.getElementById('pdfLoading').style.display='none';">
            <p>Your browser doesn't support PDF viewing.</p>
          </object>
          
          <!-- Fallback 1: PDF.js viewer -->
          <div id="pdfFallback" style="display: none; width: 100%; height: 100%;">
            <iframe src="https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(pdfUrl)}" 
                    style="width: 100%; height: 100%; border: none;"
                    onload="console.log('PDF.js viewer loaded')"
                    onerror="this.style.display='none'; document.getElementById('pdfFallback2').style.display='block';">
            </iframe>
          </div>
          
          <!-- Fallback 2: Convert to image option -->
          <div id="pdfFallback2" style="display: none; text-align: center; padding: 40px; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
            <span class="material-symbols-outlined" style="font-size: 64px; color: #666; margin-bottom: 16px;">picture_as_pdf</span>
            <h3>PDF Preview Not Available</h3>
            <p>Your browser doesn't support PDF viewing. Convert to image for better viewing.</p>
            <div style="margin-top: 20px;">
              <button onclick="documentsPage.convertPdfToImage('${documentData._id}')" 
                      class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; margin: 8px;">
                <span class="material-symbols-outlined">image</span>
                Convert to Image
              </button>
            </div>
          </div>
          
          <!-- Loading indicator -->
          <div id="pdfLoading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; z-index: 10; background: rgba(255,255,255,0.9); padding: 20px; border-radius: 8px;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 0 auto 16px;"></div>
            <p>Loading PDF...</p>
          </div>
        </div>
        
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
      
      // Hide loading after a delay if PDF doesn't load
      setTimeout(() => {
        const loading = document.getElementById('pdfLoading');
        if (loading && loading.style.display !== 'none') {
          loading.style.display = 'none';
          // If PDF object failed to load, show fallback
          const pdfObject = document.getElementById('pdfObject');
          if (pdfObject && pdfObject.style.display !== 'none') {
            pdfObject.style.display = 'none';
            document.getElementById('pdfFallback').style.display = 'block';
          }
        }
      }, 5000);
      
    } else {
      console.log('Unknown file type, showing generic view');
      // Hide zoom controls for other file types
      this.showZoomControls(false);
      
      viewer.innerHTML = `
        <div style="text-align: center; padding: 40px;">
          <span class="material-symbols-outlined" style="font-size: 64px; color: #666; display: block; margin-bottom: 16px;">description</span>
          <h3>Document Preview Not Available</h3>
          <p>File type: ${documentData.fileType}</p>
        </div>
      `;
    }

    // Show modal with proper display
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    console.log('Modal should now be visible');
    
    // Add a small delay to ensure modal is rendered
    setTimeout(() => {
      const modalRect = modal.getBoundingClientRect();
      console.log('Modal dimensions:', modalRect);
      const viewerRect = viewer.getBoundingClientRect();
      console.log('Viewer dimensions:', viewerRect);
    }, 100);
  }

  closeModal() {
    const modal = document.getElementById('documentModal');
    const viewer = document.getElementById('documentViewer');
    
    // Reset zoom state
    this.zoomLevel = 1;
    this.imagePosition = { x: 0, y: 0 };
    this.isDragging = false;
    
    // Hide zoom controls
    this.showZoomControls(false);
    
    // Remove zoomed class
    if (viewer) {
      viewer.classList.remove('zoomed');
    }
    
    // Hide modal
    modal.style.display = 'none';
    document.body.style.overflow = '';
    this.currentDocument = null;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  showError(message) {
    // You can implement a toast notification system here
    alert('Error: ' + message);
  }

  showSuccess(message) {
    // You can implement a toast notification system here
    alert('Success: ' + message);
  }

  showUploadArea() {
    // Check if user is owner before showing upload area
    if (!this.isOwner) {
      this.showError('Only event owners can upload maps');
      return;
    }
    
    const uploadSection = document.querySelector('.upload-section');
    uploadSection.style.display = 'block';
    uploadSection.scrollIntoView({ behavior: 'smooth' });
  }

  async deleteDocumentDirect(documentId) {
    // Check if user is owner before allowing delete
    if (!this.isOwner) {
      this.showError('Only event owners can remove maps');
      return;
    }
    
    if (!confirm('Are you sure you want to remove this map?')) return;

    try {
      const apiBase = window.API_BASE || API_BASE || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/api/tables/${this.eventId}/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      this.showSuccess('Map removed successfully');
      this.loadDocuments();
      
    } catch (error) {
      console.error('Delete document error:', error);
      this.showError('Failed to remove map');
    }
  }

  async convertPdfToImage(documentId) {
    try {
      this.showSuccess('Converting PDF to image... This may take a moment.');
      
      // Get the document data
      const apiBase = window.API_BASE || API_BASE || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/api/tables/${this.eventId}/documents/${documentId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load document');
      }

      const documentData = await response.json();
      
      // Use Cloudinary's transformation to convert PDF to image
      // Extract the public_id from the URL
      const publicId = documentData.cloudinaryPublicId;
      
      // Create image URL from PDF using Cloudinary transformations
      const imageUrl = `https://res.cloudinary.com/dnp0pvego/image/upload/f_jpg,q_auto,w_1200/${publicId}.jpg`;
      
      console.log('Converted PDF to image URL:', imageUrl);
      
      // Update the modal to show the image instead
      const viewer = document.getElementById('documentViewer');
      viewer.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f0f0f0;">
          <img src="${imageUrl}" 
               alt="${documentData.originalName} (converted to image)"
               style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;"
               onload="console.log('Converted PDF image loaded successfully'); documentsPage.showSuccess('PDF converted to image successfully!');"
               onerror="console.error('Failed to convert PDF to image'); documentsPage.showError('Failed to convert PDF to image. The PDF might be too complex or corrupted.');">
        </div>
      `;
      
    } catch (error) {
      console.error('Convert PDF to image error:', error);
      this.showError('Failed to convert PDF to image: ' + error.message);
    }
  }

  showZoomControls(show) {
    const zoomOut = document.getElementById('zoomOut');
    const zoomIn = document.getElementById('zoomIn');
    const zoomLevel = document.getElementById('zoomLevel');
    const resetZoom = document.getElementById('resetZoom');
    
    if (show) {
      if (zoomOut) zoomOut.style.display = 'block';
      if (zoomIn) zoomIn.style.display = 'block';
      if (zoomLevel) zoomLevel.style.display = 'block';
      if (resetZoom) resetZoom.style.display = 'block';
    } else {
      if (zoomOut) zoomOut.style.display = 'none';
      if (zoomIn) zoomIn.style.display = 'none';
      if (zoomLevel) zoomLevel.style.display = 'none';
      if (resetZoom) resetZoom.style.display = 'none';
    }
  }

  setupImageZoom() {
    const image = document.getElementById('zoomableImage');
    const viewer = document.getElementById('documentViewer');
    const zoomOut = document.getElementById('zoomOut');
    const zoomIn = document.getElementById('zoomIn');
    const resetZoom = document.getElementById('resetZoom');
    const zoomLevel = document.getElementById('zoomLevel');
    
    if (!image || !viewer) return;
    
    // Reset zoom state
    this.zoomLevel = 1;
    this.imagePosition = { x: 0, y: 0 };
    this.updateZoomDisplay();
    
    // Zoom functions
    const zoomImage = (factor) => {
      const newZoom = Math.max(0.1, Math.min(5, this.zoomLevel * factor));
      this.zoomLevel = newZoom;
      this.updateImageTransform();
      this.updateZoomDisplay();
      
      // Add/remove zoomed class for styling
      if (this.zoomLevel > 1) {
        viewer.classList.add('zoomed');
      } else {
        viewer.classList.remove('zoomed');
        this.imagePosition = { x: 0, y: 0 }; // Reset position when zoomed out
        this.updateImageTransform();
      }
    };
    
    const resetZoomLevel = () => {
      this.zoomLevel = 1;
      this.imagePosition = { x: 0, y: 0 };
      this.updateImageTransform();
      this.updateZoomDisplay();
      viewer.classList.remove('zoomed');
    };
    
    // Button event listeners
    if (zoomIn) {
      zoomIn.addEventListener('click', () => zoomImage(1.2));
    }
    if (zoomOut) {
      zoomOut.addEventListener('click', () => zoomImage(0.8));
    }
    if (resetZoom) {
      resetZoom.addEventListener('click', resetZoomLevel);
    }
    
    // Mouse wheel zoom
    viewer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomImage(factor);
    });
    
    // Pan functionality when zoomed
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    
    image.addEventListener('mousedown', (e) => {
      if (this.zoomLevel > 1) {
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        image.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isDragging && this.zoomLevel > 1) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        this.imagePosition.x += dx;
        this.imagePosition.y += dy;
        dragStart = { x: e.clientX, y: e.clientY };
        this.updateImageTransform();
        e.preventDefault();
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        image.style.cursor = this.zoomLevel > 1 ? 'grab' : 'default';
      }
    });
    
    // Touch support for mobile
    let touchStart = { x: 0, y: 0 };
    
    image.addEventListener('touchstart', (e) => {
      if (this.zoomLevel > 1 && e.touches.length === 1) {
        const touch = e.touches[0];
        touchStart = { x: touch.clientX, y: touch.clientY };
        e.preventDefault();
      }
    });
    
    image.addEventListener('touchmove', (e) => {
      if (this.zoomLevel > 1 && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - touchStart.x;
        const dy = touch.clientY - touchStart.y;
        this.imagePosition.x += dx;
        this.imagePosition.y += dy;
        touchStart = { x: touch.clientX, y: touch.clientY };
        this.updateImageTransform();
        e.preventDefault();
      }
    });
  }
  
  updateImageTransform() {
    const image = document.getElementById('zoomableImage');
    if (image) {
      image.style.transform = `translate(${this.imagePosition.x}px, ${this.imagePosition.y}px) scale(${this.zoomLevel})`;
    }
  }
  
  updateZoomDisplay() {
    const zoomLevel = document.getElementById('zoomLevel');
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }
}

// Global variable to hold the documents page instance
let documentsPage;

// IMMEDIATE DEBUG: About to define initPage function
console.log('🔥 About to define initPage function');

// Initialize function called by app.js
function initPage(eventId) {
  console.log('Documents page initPage called with eventId:', eventId);
  
  // Add debugging for timing and state
  console.log('initPage called at:', new Date().toISOString());
  console.log('DOM ready state:', document.readyState);
  console.log('Window loaded:', document.readyState === 'complete');
  
  // Store the eventId in localStorage for consistency
  if (eventId) {
    localStorage.setItem('eventId', eventId);
  }
  
  // Ensure DOM is ready before initializing
  const initialize = () => {
    console.log('Initializing documents page...');
    
    // Check if required elements exist
    const uploadArea = document.getElementById('uploadArea');
    const documentsGrid = document.getElementById('documentsGrid');
    
    console.log('Upload area exists:', !!uploadArea);
    console.log('Documents grid exists:', !!documentsGrid);
    
    if (!uploadArea || !documentsGrid) {
      console.error('Required DOM elements not found, retrying in 100ms...');
      setTimeout(initialize, 100);
      return;
    }
    
    // Initialize the documents page (use global variable, don't redeclare)
    documentsPage = new DocumentsPage();
    documentsPage.init();
    
    // Make it globally available for debugging
    window.documentsPage = documentsPage;
    
    console.log('Documents page initialized successfully');
  };
  
  // Initialize immediately if DOM is ready, otherwise wait
  if (document.readyState === 'loading') {
    console.log('DOM still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    console.log('DOM ready, initializing immediately...');
    initialize();
  }
}

// Ensure this page's initPage function is the only one available
window.initPage = initPage;

// Add debugging to confirm the function is properly defined
console.log('documents.js loaded, window.initPage defined:', typeof window.initPage === 'function');
console.log('documents.js initPage function:', window.initPage);
} catch (error) {
  console.error('🔥 CRITICAL ERROR in documents.js:', error);
  console.error('🔥 Error stack:', error.stack);
} 