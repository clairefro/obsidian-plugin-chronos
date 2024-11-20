import { requestUrl } from "obsidian";
import { systemPrompt } from "./systemPrompt";
import { OPENAI_MODEL } from "../../constants";

export interface Message {
  role: string;
  content: string;
}

const SYSTEM_MSG = { role: "system", content: systemPrompt };

export class GenAi {
  private apiKey;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async toChronos(content: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        `No API Key set - ensure you've set an API Key in Chronos Timeline plugin settings`
      );
    }

    const messages = [SYSTEM_MSG, { role: "user", content }];

    const response = await this._getResponse(messages);

    return response;
  }

  async _getResponse(messages: Message[]): Promise<string> {
    const data = {
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
    };

    const url = "https://api.openai.com/v1/chat/completions";

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const options = {
      url,
      method: "POST",
      body: JSON.stringify(data),
      headers: headers as unknown as Record<string, string>,
    };

    const response: {
      json: { choices: { message: { content: string } }[] };
    } = await requestUrl(options);

    return response.json.choices[0].message.content;
  }
}
