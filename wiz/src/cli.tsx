#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import Completion from './components/Completion.js';
import {spawn} from 'child_process';
import {getConfig} from './utils/config.js';
import SetupPage from './pages/SetupPage.js';
import PromptingPage from './pages/PromptingPage.js';
import completionLoop from './completionLoop.js';

const cli = meow(
	`
`,
	{
		importMeta: import.meta,
		flags: {
			settings: {
				type: 'boolean',
				shortFlag: 's',
			},
		},
	},
);

const input = cli.input.join(' ');

if (!getConfig('openai_key')) {
	const {waitUntilExit} = render(<SetupPage />);
	await waitUntilExit();
}

if (input.trim() !== '') {
	render(<PromptingPage prompt={input} />);
} else {
	await completionLoop();
}
