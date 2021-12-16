import RobustWebSocket from "robust-websocket";
import axios from "axios";
let currentUserId;

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


export class BusinessApi {
  constructor(signalApi, streamApi) {
    this.signalApi = signalApi;
    this.streamApi = streamApi;
    this.peerConnectionMap = new Map();
    this.offerPC = null;
  }
  async dialUser(toUserId) {
    this.offerPC = new RTCPeerConnection(Constants.RTC_CONFIGURATION);
    this.peerConnectionMap.set(toUserId, this.offerPC);
    this.offerPC.onicecandidate = (e) => {
      if (e.candidate) {
        this.signalApi.sendCandidateToUser(toUserId, e.candidate);
      }
    };
    this.offerPC.ontrack = (e) => {
      this.streamApi.getStream(toUserId).addTrack(e.track);
    };
    this.offerPC.onnegotiationneeded = async (e) => {
      let offer = await this.offerPC.createOffer();
      await this.offerPC.setLocalDescription(new RTCSessionDescription(offer));
      this.signalApi.sendOfferToUser(toUserId, offer);
    };
    this.offerPC.onsignalingstatechange = (e) => {
      console.log(this.offerPC.signalingState);
    };
    const localStream = await this.streamApi.initLocalStream(currentUserId);
    localStream.getTracks().forEach((t) => {
      this.offerPC.addTrack(t);
    });
  }
  async handleAnswer(fromUserId, answer) {
    await this.peerConnectionMap
      .get(fromUserId)
      .setRemoteDescription(new RTCSessionDescription(answer));
  }
  addCandidate(fromUserId, candidate) {
    this.peerConnectionMap
      .get(fromUserId)
      .addIceCandidate(new RTCIceCandidate(candidate));
  }
  async answer(fromUserId, offer) {
    const answerPC = new RTCPeerConnection(Constants.RTC_CONFIGURATION);
    this.peerConnectionMap.set(fromUserId, answerPC);

    answerPC.ontrack = (e) => {
      this.streamApi.getStream(fromUserId).addTrack(e.track);
    };
    answerPC.onicecandidate = (e) => {
      if (e.candidate) {
        this.signalApi.sendCandidateToUser(fromUserId, e.candidate);
      }
    };
    answerPC.onsignalingstatechange = (e) => {
      console.log(answerPC.signalingState);
    };

    await answerPC.setRemoteDescription(new RTCSessionDescription(offer));
    const localStream = await this.streamApi.initLocalStream(currentUserId);

    let tracks = localStream.getTracks();
    tracks.forEach((t) => {
      answerPC.addTrack(t);
    });

    let answer = await answerPC.createAnswer();
    await answerPC.setLocalDescription(new RTCSessionDescription(answer));

    this.signalApi.sendAnswerToUser(fromUserId, answer);
  }
}

export class SignalApi {
  constructor(sendMessageJson) {
    this.sendMessageJson = sendMessageJson;
  }
  async send(type, payload, additionalData = {}) {
    return await this.sendMessageJson({
      type,
      payload,
      ...additionalData,
    });
  }
  async login(userId) {
    this.send("login", { userId });
  }
  async sendOfferToUser(toUserId, offer) {
    await this.sendMessageToUser(toUserId, "offer", { offer });
  }
  async sendAnswerToUser(toUserId, answer) {
    await this.sendMessageToUser(toUserId, "answer", { answer });
  }
  async sendCandidateToUser(toUserId, candidate) {
    await this.sendMessageToUser(toUserId, "candidate", { candidate });
  }
  async sendMessageToUser(toUserId, type, payload) {
    payload.toUserId = toUserId;
    await this.send(type, payload);
  }
}

export class StreamApi {
  constructor() {
    this.streamMap = new Map();
  }
  setStream(userId, stream) {
    this.streamMap.set(userId, stream);
  }
  getStream(userId) {
    let stream = this.streamMap.get(userId);
    if (!stream) {
      stream = new MediaStream();
      this.setStream(userId, stream);
    }
    return stream;
  }
  async initLocalStream(userId) {
    const localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    this.setStream(userId, localStream);
    return localStream;
  }
}
