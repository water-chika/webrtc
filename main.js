'use strict';

const startButton = document.getElementById('startButton');
const hangupButton = document.getElementById('hangupButton');
hangupButton.disabled = true;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let pc;
let localStream;

function WebSocketBroadCastChannel(url) {
    this.socket = new WebSocket(url);
    this.socket.onmessage = e=> {
        console.log(e);
        const msg = JSON.parse(e.data);
        let message = {data : msg};
        this.onmessage(message);
    }
    this.postMessage = obj => {
        this.socket.send(JSON.stringify(obj));
    }
}

const signaling = new WebSocketBroadCastChannel("ws://43.136.136.91:8080");
signaling.onmessage = e=> {
    if (!localStream) {
        console.log('not ready yet');
        return;
    }
    switch (e.data.type) {
        case 'offer':
            handleOffer(e.data);
            break;
            case 'answer':
                handleAnswer(e.data);
        case 'candidate':
            handleCandidate(e.data);
            break;
        case 'ready':
            if (pc) {
                console.log('already in call, ignoring');
                return;
            }
            makeCall();
            break;
        case 'bye':
            if (pc) {
                hangup();
            }
            break;
        default:
            console.log('unhandled', e);
            break;
    }
};

startButton.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    localVideo.srcObject = localStream;

    startButton.disabled = true;
    hangupButton.disabled = false;

    signaling.postMessage({type: 'ready'});
};

hangupButton.onclick = async () => {
    hangup();
    signaling.postMessage({type: 'bye'});
};

async function hangup() {
    if (pc) {
        pc.close();
        pc = null;
    }
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    startButton.disabled = false;
    hangupButton.disabled = true;
};

function createPeerConnection() {
    pc = new RTCPeerConnection();
    pc.onicecandidate = e => {
        const message = {
            type: 'candidate',
            candidate: null,
        };
        if (e.candidate) {
            message.candidate = e.candidate.candidate;
            message.sdpMid = e.candidate.sdpMid;
            message.sdpMLineIndex = e.candidate.sdpMLineIndex;
        }
        signaling.postMessage(message);
    };
    pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
}

async function makeCall() {
    await createPeerConnection();
    const offer = await pc.createOffer();
    signaling.postMessage({type: 'offer', sdp:offer.sdp});
    await pc.setLocalDescription(offer);
}


async function handleOffer(offer) {
    if (pc) {
        console.error('existing peerconnection');
        return;
    }
    await createPeerConnection();
    await pc.setRemoteDescription(offer);
    
    const answer = await pc.createAnswer();
    signaling.postMessage({type: 'answer', sdp: answer.sdp});
    await pc.setLocalDescription(answer);
}

async function handleAnswer(answer) {
    if (!pc) {
        console.error('no peerconnection');
        return;
    }
    await pc.setRemoteDescription(answer);
}

async function handleCandidate(candidate) {
    if (!pc) {
        console.error('no peerconnection');
        return;
    }
    if (!candidate.candidate) {
        await pc.addIceCandidate(null);
    } else {
        await pc.addIceCandidate(candidate);
    }
}