class VideoCall {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.isVideoOn = true;
        this.isAudioOn = true;
        this.callId = new URLSearchParams(window.location.search).get('call_id');
        this.callDuration = 0;
        this.timerInterval = null;

        this.initializeElements();
        this.initializeEventListeners();
        this.startCall();
    }

    initializeElements() {
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.toggleVideoBtn = document.getElementById('toggleVideo');
        this.toggleAudioBtn = document.getElementById('toggleAudio');
        this.endCallBtn = document.getElementById('endCall');
        this.timerDisplay = document.getElementById('timer');
        this.statusDisplay = document.getElementById('status');
    }

    initializeEventListeners() {
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        this.endCallBtn.addEventListener('click', () => this.endCall());
    }

    async startCall() {
        try {
            this.statusDisplay.textContent = 'Подключение к медиаустройствам...';
            
            // Запрос доступа к камере и микрофону
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            this.localVideo.srcObject = this.localStream;
            this.statusDisplay.textContent = 'Создание peer-соединения...';
            
            await this.createPeerConnection();
            await this.startSignaling();
            this.startTimer();
            
        } catch (error) {
            console.error('Error starting call:', error);
            this.statusDisplay.textContent = 'Ошибка: ' + error.message;
        }
    }

    async createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        // Добавляем локальные треки
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // Обработчик удаленного потока
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.remoteVideo.srcObject = this.remoteStream;
            this.statusDisplay.textContent = 'Подключено';
        };

        // Обработчик ICE кандидатов
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal('ice-candidate', event.candidate);
            }
        };
    }

    async startSignaling() {
        // Создаем offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        // Отправляем offer на сервер
        await this.sendSignal('offer', offer);
        
        // Периодически проверяем answer
        this.checkForAnswer();
    }

    async sendSignal(type, data) {
        try {
            const response = await fetch('/signal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    callId: this.callId,
                    type: type,
                    data: data
                })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Error sending signal:', error);
        }
    }

    async checkForAnswer() {
        try {
            const response = await fetch('/signal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    callId: this.callId,
                    type: 'get-answer'
                })
            });
            
            const data = await response.json();
            
            if (data.answer) {
                await this.peerConnection.setRemoteDescription(data.answer);
            } else {
                // Продолжаем проверять каждые 2 секунды
                setTimeout(() => this.checkForAnswer(), 2000);
            }
        } catch (error) {
            console.error('Error checking for answer:', error);
            setTimeout(() => this.checkForAnswer(), 2000);
        }
    }

    toggleVideo() {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            this.isVideoOn = !videoTrack.enabled;
            videoTrack.enabled = this.isVideoOn;
            this.toggleVideoBtn.textContent = this.isVideoOn ? '📹' : '📹 Off';
        }
    }

    toggleAudio() {
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            this.isAudioOn = !audioTrack.enabled;
            audioTrack.enabled = this.isAudioOn;
            this.toggleAudioBtn.textContent = this.isAudioOn ? '🎤' : '🎤 Off';
        }
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            this.callDuration++;
            this.updateTimerDisplay();
        }, 1000);
    }

    updateTimerDisplay() {
        const hours = Math.floor(this.callDuration / 3600);
        const minutes = Math.floor((this.callDuration % 3600) / 60);
        const seconds = this.callDuration % 60;
        
        this.timerDisplay.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    endCall() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        
        this.statusDisplay.textContent = 'Звонок завершен';
        
        // Закрываем Mini App через 3 секунды
        setTimeout(() => {
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.close();
            }
        }, 3000);
    }
}

// Запускаем приложение когда страница загрузится
document.addEventListener('DOMContentLoaded', () => {
    new VideoCall();
});