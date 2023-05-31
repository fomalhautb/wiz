#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import Completion from './components/Completion.js';
import { executeCommandInBash } from './utils/bash.js';

const completionLoop = async () => {
	while (true) {
		let input = '';
		const {waitUntilExit} = render(<Completion onExit={i => (input = i)} />);
		await waitUntilExit();

		if (input.trim() === 'exit') {
			break;
		}

		await executeCommandInBash(input);
	}
};

export default completionLoop;
