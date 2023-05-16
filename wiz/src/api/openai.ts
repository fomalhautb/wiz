import {Configuration, OpenAIApi} from 'openai';
import {OPENAI_KEY, OPENAI_ORG} from '../utils/constants.js';
import {Generation} from '../types.js';
import { partialParse } from '../utils/partialJsonParser.js';

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
`;

const parseGeneration = (text: string): Generation | undefined => {
	let parsed;
	try {
		parsed = partialParse(text + '",');
	} catch (error) {
		return;
	}

	if (typeof parsed.explaination != 'string') {
		parsed.explaination = JSON.stringify(parsed.explaination);
	}

	return {
		command: parsed.command || '',
		explaination: parsed.explaination || '',
	};
};

export const generateCommand = async (
	instructions: string[],
): Promise<Generation | undefined> => {
	if (instructions.length === 0) {
		return;
	}

	const completion = await openai.createChatCompletion({
		model: 'gpt-3.5-turbo',
		messages: [
			{role: 'system', content: SYSTEM_PROMPT},
			{role: 'user', content: 'Instruction: ' + instructions[0] || ''},
		],
		temperature: 0,
	});

	const text = completion?.data?.choices?.[0]?.message?.content;
	if (!text) return;
	return parseGeneration(text);
};

export const generateCommandStream = async (
	instructions: string[],
	callback: (generation: Generation | undefined) => void,
) => {
	const res = await openai.createChatCompletion(
		{
			model: 'gpt-3.5-turbo',
			messages: [
				{role: 'system', content: SYSTEM_PROMPT},
				{role: 'user', content: 'Instruction: ' + instructions[0] || ''},
			],
			max_tokens: 500,
			stream: true,
			temperature: 0,
		},
		{responseType: 'stream'},
	);
	
	let text = '';

	(res.data as any).on('data', (data: any) => {
		const lines = data
			.toString()
			.split('\n')
			.filter((line: string) => line.trim() !== '');
		for (const line of lines) {
			const message = line.replace(/^data: /, '');
			if (message === '[DONE]') {
				callback(undefined);
				return;
			}
			const parsed = JSON.parse(message);
			text += parsed.choices[0].delta.content || '';
			// console.log(text);
			callback(parseGeneration(text));
		}
	});
};
