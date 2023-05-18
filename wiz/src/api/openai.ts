import {ChatCompletionRequestMessage, Configuration, OpenAIApi} from 'openai';
import {Generation} from '../types.js';
import {partialParse} from '../utils/partialJsonParser.js';
import {getConfig} from '../utils/config.js';

const SYSTEM_PROMPT = `
You are a CLI assistant. You help the user to generate commands from natrual language instructions. You can ONLY output json files that can be parsed by JavaScript JSON.parse. NO other expalination.
The output format:
{
  "command": "string. the generated command",
  "explaination": "string. the explaination of each part of the command",
}
Note: the user is using a Mac.
`;

export const checkApiKey = async (apiKey: string, organization?: string) => {
	const configuration = new Configuration({
		apiKey: apiKey,
		organization: organization,
	});
	const openai = new OpenAIApi(configuration);

	try {
		await openai.listModels();
		return true;
	} catch (error) {
		return false;
	}
};

const parseGeneration = (text: string): Generation | undefined => {
	let parsed;
	try {
		// TODO: this is a hack for not finished text, solve it with a more robust way later
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

export const generateCommandStream = async (
	prompts: string[],
	generations: Generation[],
	callback: (generation: Generation | undefined) => void,
) => {
	if (prompts.length === 0 || prompts.length - 1 != generations.length) {
		throw new Error('Invalid prompts or generations');
	}

	const configuration = new Configuration({
		apiKey: getConfig('openai_key'),
		organization: getConfig('openai_org'),
	});
	const openai = new OpenAIApi(configuration);

	const messages: ChatCompletionRequestMessage[] = [{role: 'system', content: SYSTEM_PROMPT}];
	for (let i = 0; i < prompts.length; i++) {
		messages.push({role: 'user', content: 'Instruction: ' + prompts[i]});
		if (generations[i]) {
			messages.push({
				role: 'assistant',
				content: JSON.stringify(generations[i]),
			});
		}
	}

	const res = await openai.createChatCompletion(
		{
			model: 'gpt-3.5-turbo',
			messages,
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
			callback(parseGeneration(text));
		}
	});
};
