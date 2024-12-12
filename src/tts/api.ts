import axios from "axios";

const VOICEVOX_API_KEY = process.env.REACT_APP_VOICEVOX_API_KEY;

export const voiceDataAPI = async (text: string): Promise<ArrayBuffer> => {
  const response = await axios.get(
    "https://deprecatedapis.tts.quest/v2/voicevox/audio/",
    {
      params: {
        text,
        key: VOICEVOX_API_KEY,
        speaker: 1,
        pitch: 0.05,
        intonationScale: 1.1,
        speed: 1.3,
      },
      responseType: "arraybuffer",
    }
  );

  return response.data;
};
