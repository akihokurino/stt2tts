import OpenAI from "openai";
import { ChatCompletionMessage } from "openai/resources";

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY!!,
  dangerouslyAllowBrowser: true,
});

export type Message = {
  role: "user" | "system";
  content: string;
};

export const chatCompletionsAPI = async (
  messages: Message[],
  received: (text: ChatCompletionMessage) => void
) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });

  received(completion.choices[0].message);
};
