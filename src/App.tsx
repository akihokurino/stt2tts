import { ChatCompletionMessage } from "openai/resources";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Recorder from "./audio/recorder";
import { chatCompletionsAPI, Message } from "./gpt/api";
import { speechRecognizeAPI } from "./stt/api";
import { voiceDataAPI } from "./tts/api";
import { VRMViewer } from "./vroid/features/vrmViewer/viewer";

type SpeakMessageQueue = {
  isSpoke: boolean;
  isPrepare: boolean;
  oneSentence: string;
  audio: ArrayBuffer | undefined;
};

const ViewerContext = createContext({ vrmViewer: new VRMViewer() });

function App() {
  const { vrmViewer } = useContext(ViewerContext);

  const [messages, setMessages] = useState([] as Message[]);
  const [isReplying, setIsReplying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAudioRecognizing, setIsAudioRecognizing] = useState(false);
  const [isReady, setIsReady] = useState(true);

  const isInitialized = useRef<boolean>(false);
  const recorderRef = useRef<Recorder | null>(null);
  const messageUIRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakQueue = useRef<SpeakMessageQueue[]>([]);
  const isSpeaking = useRef<boolean>(false);
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (canvas) {
        vrmViewer.setup(canvas);
        vrmViewer.loadVrm(`${process.env.PUBLIC_URL}/sample.vrm`, () => {
          setTimeout(() => {
            setIsReady(true);
          }, 500);
        });
      }
    },
    [vrmViewer]
  );

  const initRecorder = (stream: MediaStream) => {
    recorderRef.current = new Recorder(stream, (blob: any) => {
      setIsRecording(false);

      const reader = new FileReader();
      reader.onload = () => {
        setIsAudioRecognizing(true);
        speechRecognizeAPI(new Uint8Array(reader.result! as ArrayBuffer))
          .then((text) => {
            setIsAudioRecognizing(false);
            sendMessage(text);
          })
          .catch((error) => {
            setIsAudioRecognizing(false);
            startRecording();
          });
      };
      reader.readAsArrayBuffer(blob);
    });
  };

  const sendMessage = async (text: string) => {
    if (text === "") {
      return;
    }
    setMessages((prevMessages) => [
      ...prevMessages,
      { role: "user", content: text },
    ]);
  };

  const reply = async () => {
    setIsReplying(true);

    try {
      const context = messages.slice(-10);
      await chatCompletionsAPI(context, (message: ChatCompletionMessage) => {
        setIsReplying(false);

        setMessages((prevMessages) => [
          ...prevMessages,
          { role: "system", content: message.content!! },
        ]);

        startRecording();

        const oneSentence = message.content!!;
        speakQueue.current.push({
          isSpoke: false,
          isPrepare: false,
          oneSentence,
          audio: undefined,
        });
        prepareSpeak();

        for (let i = speakQueue.current.length - 1; i >= 0; i--) {
          if (speakQueue.current[i].isSpoke) {
            speakQueue.current.splice(i, 1);
          }
        }
      });
    } catch (e) {
      setIsReplying(false);
      alert(e);
    }
  };

  const prepareSpeak = async () => {
    const noAudioMessages = speakQueue.current.filter(
      (q) => !q.isPrepare && !q.audio
    );
    if (noAudioMessages.length === 0) {
      return;
    }

    const message = noAudioMessages[0];

    for (let i = 0; i < speakQueue.current.length; i++) {
      if (speakQueue.current[i].isPrepare) {
        continue;
      }
      if (speakQueue.current[i].oneSentence === message.oneSentence) {
        speakQueue.current[i].isPrepare = true;
        break;
      }
    }

    try {
      const data = await voiceDataAPI(message.oneSentence);
      for (let i = 0; i < speakQueue.current.length; i++) {
        if (speakQueue.current[i].audio) {
          continue;
        }
        if (speakQueue.current[i].oneSentence === message.oneSentence) {
          speakQueue.current[i].audio = data;
          break;
        }
      }

      prepareSpeak();
      speak();
    } catch (e) {
      alert(e);
    }
  };

  const speak = async () => {
    if (isSpeaking.current) {
      return;
    }

    let message: SpeakMessageQueue | undefined;
    for (let i = 0; i < speakQueue.current.length; i++) {
      if (speakQueue.current[i].isSpoke) {
        continue;
      }

      if (speakQueue.current[i].audio === undefined) {
        return;
      }

      message = speakQueue.current[i];
      break;
    }
    if (!message) {
      return;
    }

    isSpeaking.current = true;

    await new Promise(async (resolve) => {
      if (!audioRef.current) {
        return;
      }

      const blob = new Blob([message!.audio!], {
        type: "audio/wav",
      });
      audioRef.current.pause();
      audioRef.current.src = URL.createObjectURL(blob);
      audioRef.current.load();
      audioRef.current.onended = () => resolve(void 0);
      audioRef.current.play().catch((err) => alert(err));

      vrmViewer.model?.speak(message!.audio!, "relaxed");
    });

    for (let i = 0; i < speakQueue.current.length; i++) {
      if (speakQueue.current[i].isSpoke) {
        continue;
      }
      if (speakQueue.current[i].oneSentence === message.oneSentence) {
        speakQueue.current[i].isSpoke = true;
        break;
      }
    }

    isSpeaking.current = false;
    speak();
  };

  const startRecording = () => {
    setIsRecording(true);
    recorderRef.current!.start();
  };

  useEffect(() => {
    if (messageUIRef.current) {
      const scrollHeight = messageUIRef.current.scrollHeight;
      messageUIRef.current.scrollTo(0, scrollHeight);
    }

    if (
      messages.length !== 0 &&
      messages[messages.length - 1].role === "user"
    ) {
      reply();
    }
  }, [messages]);

  useEffect(() => {
    if (isInitialized.current) {
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      initRecorder(stream);
    });

    isInitialized.current = true;
  }, []);

  return (
    <div className="bg-slate-900 w-full h-screen">
      <audio ref={audioRef} />

      {(isReplying || isRecording || isAudioRecognizing) && (
        <div className="fixed flex justify-center items-center py-4 top-[50px] left-0 right-0 mx-auto w-48 rounded-xl bg-slate-900 mt-2 bg-opacity-50 z-20">
          {isReplying && (
            <>
              <div className="animate-spin h-8 w-8 bg-blue-300 rounded-xl"></div>
              <p className="ml-5 text-white text-xs">回答中...</p>
            </>
          )}
          {isRecording && (
            <>
              <div className="animate-spin h-8 w-8 bg-green-300 rounded-xl"></div>
              <p className="ml-5 text-white text-xs">録音中...</p>
            </>
          )}
          {isAudioRecognizing && (
            <>
              <div className="animate-spin h-8 w-8 bg-yellow-300 rounded-xl"></div>
              <p className="ml-5 text-white text-xs">音声認識中...</p>
            </>
          )}
        </div>
      )}
      {!isReplying && !isRecording && !isAudioRecognizing && (
        <div
          className="cursor-pointer fixed flex justify-center items-center py-4 top-[50px] left-0 right-0 mx-auto w-48 rounded-xl bg-red-400 mt-2 z-20"
          onClick={() => {
            startRecording();
          }}
        >
          <p className="text-white text-xs">開始</p>
        </div>
      )}

      {isReady && (
        <>
          <div
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            className="relative overflow-y-scroll max-h-screen min-h-screen md:w-[700px] w-full mx-auto px-2 py-[50px] z-10"
            ref={messageUIRef}
          >
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } my-2`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg text-sm bg-opacity-50 ${
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-300 text-black"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div
        className={
          "absolute top-0 left-1/2 transform -translate-x-1/2 md:w-[700px] w-full h-[100vh] z-0"
        }
      >
        <canvas
          ref={canvasRef}
          className={`h-full w-full ${!isReady ? "opacity-0" : ""}`}
        ></canvas>
      </div>
    </div>
  );
}

export default App;
