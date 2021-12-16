import RobustWebSocket from "robust-websocket";
import axios from "axios";
let currentUserId;

let ws;

const WebSocketReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

function getWebSocket() {
  if (!ws) {
    ws = new RobustWebSocket("wss://ws.teams.com:9001/websocket");
  }

  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocketReadyState.OPEN) {
      resolve(ws);
    }

    ws.addEventListener("open", (e) => {
      resolve(ws);
    });
    ws.addEventListener("error", (e) => {
      reject(e);
    });
  });
}
const axiosConfig = {
  baseURL: "https://ws.teams.com:9001/api",
  timeout: 30000,
};

const _axios = axios.create(axiosConfig);

export const webApi = {
  loginUser(userId) {
    return new Promise((resolve, reject) => {
      currentUserId = userId;
      resolve(userId);
    });
  },
  async getUserList() {
    const resp = await _axios.get("/users");
    return resp.data;
  },
  getRoomList() {},
};

const Constants = {
  RTC_CONFIGURATION: {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  },
};

const peerConnectionMap = new Map();

let offerPC;
export const businessApi = {
  async dialUser(toUserId) {
    offerPC = new RTCPeerConnection(Constants.RTC_CONFIGURATION);
    peerConnectionMap.set(toUserId, offerPC);
    offerPC.onicecandidate = (e) => {
      if (e.candidate) {
        signalApi.sendCandidateToUser(toUserId, e.candidate);
      }
    };
    offerPC.ontrack = (e) => {
      streamApi.getStream(toUserId).addTrack(e.track);
    };
    offerPC.onnegotiationneeded = async (e) => {
      let offer = await offerPC.createOffer();
      await offerPC.setLocalDescription(new RTCSessionDescription(offer));
      signalApi.sendOfferToUser(toUserId, offer);
    };
    offerPC.onsignalingstatechange = (e) => {
      console.log(offerPC.signalingState);
    };
    const localStream = await streamApi.initLocalStream(currentUserId);
    localStream.getTracks().forEach((t) => {
      offerPC.addTrack(t);
    });
  },
  async handleAnswer(fromUserId, answer) {
    await peerConnectionMap
      .get(fromUserId)
      .setRemoteDescription(new RTCSessionDescription(answer));
  },
  addCandidate(fromUserId, candidate) {
    peerConnectionMap
      .get(fromUserId)
      .addIceCandidate(new RTCIceCandidate(candidate));
  },
  async answer(fromUserId, offer) {
    const answerPC = new RTCPeerConnection(Constants.RTC_CONFIGURATION);
    peerConnectionMap.set(fromUserId, answerPC);

    answerPC.ontrack = (e) => {
      streamApi.getStream(fromUserId).addTrack(e.track);
    };
    answerPC.onicecandidate = (e) => {
      if (e.candidate) {
        signalApi.sendCandidateToUser(fromUserId, e.candidate);
      }
    };
    answerPC.onsignalingstatechange = (e) => {
      console.log(answerPC.signalingState);
    };

    await answerPC.setRemoteDescription(new RTCSessionDescription(offer));
    const localStream = await streamApi.initLocalStream(currentUserId);

    let tracks = localStream.getTracks();
    tracks.forEach((t) => {
      answerPC.addTrack(t);
    });

    let answer = await answerPC.createAnswer();
    await answerPC.setLocalDescription(new RTCSessionDescription(answer));

    signalApi.sendAnswerToUser(fromUserId, answer);
  },
};

export const signalApi = {
  async login(userId) {
    await signalApi.send("login", { userId });
    return await getWebSocket();
  },
  async sendOfferToUser(toUserId, offer) {
    await signalApi.sendMessageToUser(toUserId, "offer", { offer });
  },
  async sendAnswerToUser(toUserId, answer) {
    await signalApi.sendMessageToUser(toUserId, "answer", { answer });
  },
  async sendCandidateToUser(toUserId, candidate) {
    await signalApi.sendMessageToUser(toUserId, "candidate", { candidate });
  },
  async sendMessageToUser(toUserId, type, payload) {
    payload.toUserId = toUserId;
    await signalApi.send(type, payload);
  },
  async send(type, payload, additionalData = {}) {
    const ws = await getWebSocket();
    return await ws.send(
      JSON.stringify({
        type,
        payload,
        ...additionalData,
      })
    );
  },
};

const streamMap = new Map();
export const streamApi = {
  setStream(userId, stream) {
    streamMap.set(userId, stream);
  },
  getStream(userId) {
    let stream = streamMap.get(userId);
    console.log(userId, stream, streamMap);
    if (!stream) {
      stream = new MediaStream();
      this.setStream(userId, stream);
    }
    return stream;
  },
  async initLocalStream(userId) {
    const localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    this.setStream(userId, localStream);
    return localStream;
  },
};
