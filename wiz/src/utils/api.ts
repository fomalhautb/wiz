import {spawn} from 'child_process';
import { homedir } from 'os';
import path from 'path';
import {CompletionResult, PromptingResult} from '../types.js';
import {createParser, ParsedEvent, ReconnectInterval} from 'eventsource-parser';

const NUM_RETRY = 3;
const WAIT_TIME = 1000;

export const startServer = async () => {
	spawn(path.join(homedir(), '.wiz', 'server'), [], {
		detached: true,
		stdio: 'ignore',
	});
};

export const generatePromptingStream = async (
	prompts: string[],
	generations: PromptingResult[],
	callback: (
		generation: any,
		status: 'error' | 'success' | 'connected' | 'finished' | 'starting_server',
	) => void,
) => {
	if (prompts.length === 0 || prompts.length - 1 != generations.length) {
		throw new Error('Invalid prompts or generations');
	}

	let query = '';
	if (prompts.length > 1) {
		for (const [i, prompt] of prompts.entries()) {
			query += `${i + 1}. ${prompt}`;
		}
	} else {
		query += prompts[0];
	}

	let res: Response | null = null;
	for (let retry = 0; retry < NUM_RETRY; retry++) {
		try {
			res = await fetch('http://localhost:8085/api/completions', {
				headers: {'Content-Type': 'application/json'},
				method: 'POST',
				body: JSON.stringify({query}),
			});
			break;
		} catch (e) {
			if (retry == 0) {
				startServer();
				callback(null, 'starting_server');
			}
			await new Promise(r => setTimeout(r, WAIT_TIME));
		}
	}

	callback(null, 'connected');

	if (res === null) {
		callback(null, 'error');
		return;
	}

	const onParse = (event: ParsedEvent | ReconnectInterval) => {
		if (event.type === 'event') {
			const data = event.data;
			const json = JSON.parse(data);
			callback(json, 'success');
		}
	};

	// https://vercel.com/blog/gpt-3-app-next-js-vercel-edge-functions
	// stream response (SSE) may be fragmented into multiple chunks
	// this ensures we properly read chunks & invoke an event for each SSE event stream
	const parser = createParser(onParse);

	// https://web.dev/streams/#asynchronous-iteration
	const decoder = new TextDecoder();
	for await (const chunk of res.body as any) {
		parser.feed(decoder.decode(chunk));
	}

	callback(null, 'finished');
};

export const generateCompletion = async (
	input: string,
): Promise<CompletionResult | undefined> => {
	return undefined;
};
