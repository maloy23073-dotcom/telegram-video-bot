class VideoCall {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.isVideoOn = true;
        this.isAudioOn = true;

        this.initialize();
    }

    async initialize() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            this.callCode = urlParams.get('call_code');
            this.userId = urlParams.get('user_id');

            if (!this.callCode || !this.userId) {
                this.updateStatus('Ошибка: Неверные параметры');
                return;
            }

            await this.setupMedia();
            this.setupEventListeners();
            await this.setupWebRTC();

        } catch (error) {
            console.error('Initialization error:', error);
            this.updateStatus('Ошибка инициализации');
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
            console.error('Media error:', error);
            this.updateStatus('Не удалось получить доступ к камере/микрофону');
            throw error;
        }
    }

    setupEventListeners() {
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('endCall').addEventListener('click', () => this.endCall());
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

            // Добавляем локальные треки
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Получаем удаленный поток
            this.peerConnection.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                document.getElementById('remoteVideo').srcObject = this.remoteStream;
                this.updateStatus('Подключено');
            };

            // Обработка ICE кандидатов
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignal('ice-candidate', {
                        candidate: event.candidate,
                        userId: this.userId
                    });
                }
            };

            // Создаем offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            await this.sendSignal('offer', {
                offer: offer,
                userId: this.userId
            });

            // Периодически проверяем answers от других участников
            this.checkForAnswers();

        } catch (error) {
            console.error('WebRTC error:', error);
            this.updateStatus('Ошибка подключения');
        }
    }

    async sendSignal(type, data) {
        try {
            const response = await fetch('https://your-server.com/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callCode: this.callCode,
                    type: type,
                    data: data
                })
            });

            return await response.json();
        } catch (error) {
            console.error('Signal error:', error);
        }
    }

    async checkForAnswers() {
        try {
            const response = await this.sendSignal('get-answers', {});

            if (response.answers) {
                for (const [answerUserId, answer] of response.answers) {
                    if (answerUserId !== this.userId) {
                        await this.peerConnection.setRemoteDescription(answer);
                    }
                }
            }

            // Продолжаем проверять
            setTimeout(() => this.checkForAnswers(), 2000);

        } catch (error) {
            console.error('Check answers error:', error);
            setTimeout(() => this.checkForAnswers(), 2000);
        }
    }

    toggleVideo() {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            this.isVideoOn = !videoTrack.enabled;
            videoTrack.enabled = this.isVideoOn;
            document.getElementById('toggleVideo').textContent = this.isVideoOn ? '📹' : '📴';
        }
    }

    toggleAudio() {
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            this.isAudioOn = !audioTrack.enabled;
            audioTrack.enabled = this.isAudioOn;
            document.getElementById('toggleAudio').textContent = this.isAudioOn ? '🎤' : '🔇';
        }
    }

    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }

    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.sendSignal('leave-call', { userId: this.userId });

        // Закрываем Mini App
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.close();
        } else {
            alert('Звонок завершен');
        }
    }
}

// Запускаем при загрузке
document.addEventListener('DOMContentLoaded', () => {
    new VideoCall();
});