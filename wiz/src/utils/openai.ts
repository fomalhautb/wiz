import {ChatCompletionRequestMessage, Configuration, OpenAIApi} from 'openai';
import {CompletionResult, PromptingResult} from '../types.js';
import {partialParse} from './partialJsonParser.js';
import {getConfig} from './config.js';

const SYSTEM_MESSAGE_PROMPTING = `
You are a CLI assistant. You help the user to generate commands from natrual language instructions. You can ONLY output json files that can be parsed by JavaScript JSON.parse. NO other expalination.
The output format:
{
  "command": "string. the generated command",
  "explaination": "string. the explaination of each part of the command. Explaination should be a string, NOT json. Use line breaks to separate each part of the explaination.",
}
Note: the user is using a Mac.
`;

const SYSTEM_MESSAGE_COMPLETION = `
Your are a CLI command completion assistant. You help the user to complete a command from a partial command. You can ONLY output json files that can be parsed by JavaScript JSON.parse. NO other expalination.
The output format:
{
	"completion": "string. the completed command. Do NOT include the partial command inputed by the user. If the user input is already the completed command, return an empty string for this field. Note this string will be concatenated directly with the partial command inputed by the user, so take care of the space between them.",
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

const setUpOpenai = () => {
	const configuration = new Configuration({
		apiKey: getConfig('openai_key'),
		organization: getConfig('openai_org'),
	});
	return new OpenAIApi(configuration);
};

const chatCompletionStream = (
	messages: ChatCompletionRequestMessage[],
	callback: (generation: string | undefined) => void,
) => {
	const openai = setUpOpenai();

	openai
		.createChatCompletion(
			{
				model: 'gpt-3.5-turbo',
				messages,
				max_tokens: 500,
				stream: true,
				temperature: 0,
			},
			{responseType: 'stream'},
		)
		.then(res => {
			(res.data as any).on('data', (data: any) => {
				const lines = data
					.toString()
					.split('\n')
					.filter((line: string) => line.trim() !== '');
				for (const line of lines) {
					const message = line.replace(/^data: /, '');
					if (message === '[DONE]') {
						callback(undefined);
						continue;
					}

					const parsed = JSON.parse(message);
					callback(parsed.choices[0].delta.content || '');
				}
			});
		});
};

const chatCompletion = async messages => {
	const openai = setUpOpenai();

	const res = await openai.createChatCompletion(
		{
			model: 'gpt-3.5-turbo',
			messages,
			max_tokens: 500,
			temperature: 0,
		},
	);

	return res.data.choices[0]?.message?.content;
};

const parsePromptingResult = (text: string): PromptingResult | undefined => {
	let parsed;
	try {
		parsed = partialParse(text);
	} catch (error) {
		return;
	}

	if (typeof parsed.command !== 'string') {
		parsed.command = '';
	}

	if (typeof parsed.explaination === 'object') {
		parsed.explaination = JSON.stringify(parsed.explaination);
	} else if (typeof parsed.explaination !== 'string') {
		parsed.explaination = '';
	}

	return {
		command: parsed.command,
		explaination: parsed.explaination,
	};
};

const parseCompletionResult = (text: string): CompletionResult | undefined => {
	let parsed;
	try {
		parsed = partialParse(text);
	} catch (error) {
		return;
	}

	if (typeof parsed.completion !== 'string') {
		parsed.completion = '';
	}

	return {
		completion: parsed.completion,
	};
};

export const generatePromptingStream = (
	prompts: string[],
	generations: PromptingResult[],
	callback: (generation: PromptingResult | undefined) => void,
) => {
	if (prompts.length === 0 || prompts.length - 1 != generations.length) {
		throw new Error('Invalid prompts or generations');
	}

	const messages: ChatCompletionRequestMessage[] = [
		{role: 'system', content: SYSTEM_MESSAGE_PROMPTING},
	];
	for (let i = 0; i < prompts.length; i++) {
		messages.push({role: 'user', content: 'Instruction: ' + prompts[i]});
		if (generations[i]) {
			messages.push({
				role: 'assistant',
				content: JSON.stringify(generations[i]),
			});
		}
	}

	let text = '';
	chatCompletionStream(messages, message => {
		if (!message) return;
		text += message;
		callback(parsePromptingResult(text));
	});
};

export const generateCompletion = async (
	input: string,
): Promise<CompletionResult | undefined> => {
	const messages: ChatCompletionRequestMessage[] = [
		{role: 'system', content: SYSTEM_MESSAGE_COMPLETION},
		{role: 'user', content: 'Input: ' + input},
	];

	const result = await chatCompletion(messages);
	if (!result) return;
	return parseCompletionResult(result);
};
