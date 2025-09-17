class VideoCall {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.isVideoOn = true;
        this.isAudioOn = true;
        this.ws = null;

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
            await this.setupWebSocket();

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

    async setupWebSocket() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const signalingUrl = `${protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}`;

            this.ws = new WebSocket(`${signalingUrl}?call_code=${this.callCode}&user_id=${this.userId}`);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.updateStatus('Подключение к звонку...');
                resolve();
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleSignalingMessage(message);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.updateStatus('Соединение разорвано');
            };
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
                        candidate: event.candidate
                    });
                }
            };

            // Создаем offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            await this.sendSignal('offer', {
                offer: offer
            });

        } catch (error) {
            console.error('WebRTC error:', error);
            this.updateStatus('Ошибка подключения');
        }
    }

    async sendSignal(type, data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: type,
                data: data
            }));
        }
    }

    async handleSignalingMessage(message) {
        try {
            switch (message.type) {
                case 'offer':
                    if (message.from != this.userId) {
                        await this.peerConnection.setRemoteDescription(message.data.offer);
                        const answer = await this.peerConnection.createAnswer();
                        await this.peerConnection.setLocalDescription(answer);
                        await this.sendSignal('answer', { answer: answer });
                    }
                    break;

                case 'answer':
                    if (message.from != this.userId) {
                        await this.peerConnection.setRemoteDescription(message.data.answer);
                    }
                    break;

                case 'ice-candidate':
                    if (message.from != this.userId) {
                        await this.peerConnection.addIceCandidate(message.data.candidate);
                    }
                    break;
            }
        } catch (error) {
            console.error('Signaling message error:', error);
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

        if (this.ws) {
            this.ws.close();
        }

        // Закрываем Mini App
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.close();
        } else {
            alert('Звонок завершен');
            window.close();
        }
    }
}

// Запускаем при загрузке
document.addEventListener('DOMContentLoaded', () => {
    new VideoCall();
});