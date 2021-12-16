import {
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
  useRef,
  useMemo,
} from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";

import { TextField } from "@fluentui/react/lib/TextField";
import { PrimaryButton } from "@fluentui/react/lib/Button";
import {
  webApi,
  businessApi,
  signalApi,
  streamApi,
  SignalApi,
  StreamApi,
  BusinessApi,
} from "./Api";
import "./App.css";
import "office-ui-fabric-react/dist/css/fabric.css";

const UserContext = createContext();

function App() {
  const [socketUrl, setSocketUrl] = useState(
    "wss://ws.teams.com:9001/websocket"
  );

  const { sendJsonMessage, lastMessage, readyState, lastJsonMessage } =
    useWebSocket(socketUrl);

  const signalApi = useMemo(
    () => new SignalApi(sendJsonMessage),
    [sendJsonMessage]
  );
  const streamApi = useMemo(() => new StreamApi(), []);

  const businessApi = useMemo(
    () => new BusinessApi(signalApi, streamApi),
    [signalApi, streamApi]
  );

  const [roomId, setRoomId] = useState();
  const [inputUserId, setInputUserId] = useState();
  const [user, setUser] = useState({ id: undefined });
  const [userList, setUserList] = useState([]);
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const websocketRef = useRef();
  const enterRoom = useCallback(() => {
    // get user lists in the room
  }, [roomId]);
  useEffect(() => {
    if (lastJsonMessage === null) {
      return;
    }
    // effect
    (async () => {
      const { type, payload } = lastJsonMessage;
      if (type === "offer") {
        // offer received, need to answer
        const { fromUserId, toUserId, offer } = payload;

        await businessApi.answer(fromUserId, offer);
        localVideoRef.current.srcObject = streamApi.getStream(toUserId);
        remoteVideoRef.current.srcObject = streamApi.getStream(fromUserId);
      } else if (type === "answer") {
        // answer received
        const { fromUserId, answer } = payload;
        await businessApi.handleAnswer(fromUserId, answer);
        remoteVideoRef.current.srcObject = streamApi.getStream(fromUserId);
      } else if (type === "candidate") {
        // candidate received
        const { fromUserId, candidate } = payload;
        businessApi.addCandidate(fromUserId, candidate);
      }
      switch (type) {
        case "user_disconnected":
        case "user_connected":
          setUserList(await webApi.getUserList());
          break;
        default:
          break;
      }
    })();
    return () => {
      // cleanup
    };
  }, [lastJsonMessage, businessApi, localVideoRef, remoteVideoRef, streamApi]);

  const loginUser = useCallback(async () => {
    const userId = await webApi.loginUser(inputUserId);
    websocketRef.current = await signalApi.login(userId);
    setUser({
      ...user,
      id: userId,
    });
    setUserList(await webApi.getUserList());
  }, [inputUserId, user, websocketRef, signalApi]);

  const dialUser = useCallback(
    async (toUserId) => {
      await businessApi.dialUser(toUserId);
      localVideoRef.current.srcObject = streamApi.getStream(user.id);
    },
    [localVideoRef, user, businessApi, streamApi]
  );
  return (
    <UserContext.Provider value={user}>
      <div className="App">
        <div>
          {userList
            .filter((e) => e.id !== user.id)
            .map((user) => (
              <div key={user.id} onClick={() => dialUser(user.id)}>
                {user.id}
              </div>
            ))}
        </div>
        <TextField
          label="User ID"
          onChange={(e) => {
            setInputUserId(e.target.value);
          }}
        />
        <PrimaryButton text="Login" onClick={loginUser} />

        <div>Logged in user id: {user.id}</div>

        <video id="local-video" autoPlay={true} ref={localVideoRef} />
        <video id="remote-video" autoPlay={true} ref={remoteVideoRef} />

        <TextField
          label="Room ID"
          onChange={(e) => {
            setRoomId(e.target.value);
          }}
        />
        <PrimaryButton text="Enter room" onClick={enterRoom} />
        <div>{roomId}</div>
      </div>
    </UserContext.Provider>
  );
}

export default App;
