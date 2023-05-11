import { Configuration, OpenAIApi } from "openai";
import { OPENAI_KEY, OPENAI_ORG } from "../utils/constants.js";

const configuration = new Configuration({
  apiKey: OPENAI_KEY,
  organization: OPENAI_ORG,
});
const openai = new OpenAIApi(configuration);

const SYSTEM_PROMPT = `
You are a CLI assistant. You help the user to generate commands from natrual language instructions. You can ONLY output json files that can be parsed by JavaScript JSON.parse. NO other expalination.
The output format:
{
  "command": "string. the generated command",
  "explaination": "string. the explaination of each part of the command",
}
Note: the user is using a Mac.
`

export const generateCommand = async (instructions: string[]) => {
  if (instructions.length === 0) {
    return;
  }

  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: ('Instruction: ' + instructions[0]) || '' },
    ],
    temperature: 0,
  });

  return completion?.data?.choices?.[0]?.message?.content;
}
