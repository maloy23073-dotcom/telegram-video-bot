// public/app.js
class VideoCall {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.callId = new URLSearchParams(window.location.search).get('call_id');
        this.timerInterval = null;
        this.startTime = null;
        
        this.initialize();
    }
    
    async initialize() {
        try {
            await this.setupMedia();
            this.setupEventListeners();
            this.updateStatus('Подключение к звонку...');
            
            if (this.callId) {
                this.setupWebRTC();
                this.startTimer();
            } else {
                this.updateStatus('Ошибка: ID звонка не указан');
            }
        } catch (error) {
            console.error('Initialization error:', error);
            this.updateStatus('Ошибка инициализации: ' + error.message);
        }
    }
    
    async setupMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            document.getElementById('localVideo').srcObject = this.localStream;
            this.updateStatus('Камера и микрофон подключены');
        } catch (error) {
            console.error('Media setup error:', error);
            this.updateStatus('Не удалось получить доступ к камере/микрофону');
            throw error;
        }
    }
    
    setupEventListeners() {
        document.getElementById('toggleVideo').addEventListener('click', () => {
            const videoTracks = this.localStream.getVideoTracks();
            if (videoTracks.length > 0) {
                const enabled = !videoTracks[0].enabled;
                videoTracks[0].enabled = enabled;
                document.getElementById('toggleVideo').textContent = enabled ? '📹' : '📴';
            }
        });
        
        document.getElementById('toggleAudio').addEventListener('click', () => {
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                const enabled = !audioTracks[0].enabled;
                audioTracks[0].enabled = enabled;
                document.getElementById('toggleAudio').textContent = enabled ? '🎤' : '🔇';
            }
        });
        
        document.getElementById('endCall').addEventListener('click', () => {
            this.endCall();
        });
    }
    
    async setupWebRTC() {
        try {
            const configuration = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            };
            
            this.peerConnection = new RTCPeerConnection(configuration);
            
            // Add local stream to connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Get remote stream
            this.peerConnection.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                document.getElementById('remoteVideo').srcObject = this.remoteStream;
                this.updateStatus('Подключено');
            };
            
            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignal('ice-candidate', event.candidate);
                }
            };
            
            // Check if we should create an offer or answer
            const offerResponse = await this.sendSignal('get-offer');
            if (offerResponse.offer) {
                // Answer the call
                await this.peerConnection.setRemoteDescription(offerResponse.offer);
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                await this.sendSignal('answer', answer);
                
                // Get ICE candidates
                const candidatesResponse = await this.sendSignal('get-candidates');
                if (candidatesResponse.candidates) {
                    for (const candidate of candidatesResponse.candidates) {
                        await this.peerConnection.addIceCandidate(candidate);
                    }
                }
            } else {
                // Create the call (offer)
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                await this.sendSignal('offer', offer);
                
                // Wait for answer
                const checkAnswer = async () => {
                    try {
                        const answerResponse = await this.sendSignal('get-answer');
                        if (answerResponse.answer) {
                            await this.peerConnection.setRemoteDescription(answerResponse.answer);
                            
                            // Get ICE candidates
                            const candidatesResponse = await this.sendSignal('get-candidates');
                            if (candidatesResponse.candidates) {
                                for (const candidate of candidatesResponse.candidates) {
                                    await this.peerConnection.addIceCandidate(candidate);
                                }
                            }
                        } else {
                            setTimeout(checkAnswer, 1000);
                        }
                    } catch (error) {
                        console.error('Error checking for answer:', error);
                        setTimeout(checkAnswer, 1000);
                    }
                };
                
                setTimeout(checkAnswer, 1000);
            }
        } catch (error) {
            console.error('WebRTC setup error:', error);
            this.updateStatus('Ошибка подключения: ' + error.message);
        }
    }
    
    async sendSignal(type, data = null) {
        const response = await fetch('/signal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                callId: this.callId,
                type,
                data
            })
        });
        
        return await response.json();
    }
    
    startTimer() {
        this.startTime = new Date();
        this.timerInterval = setInterval(() => {
            const elapsed = new Date() - this.startTime;
            const hours = Math.floor(elapsed / 3600000);
            const minutes = Math.floor((elapsed % 3600000) / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            
            document.getElementById('timer').textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }
    
    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        
        window.location.href = '/';
    }
}

// Initialize the video call when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VideoCall();
});