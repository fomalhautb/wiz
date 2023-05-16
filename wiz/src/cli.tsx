#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './App.js';
import { exec } from 'child_process';

const cli = meow(
	`
`,
	{
		importMeta: import.meta,
		flags: {
			name: {
				type: 'string',
			},
		},
	},
);

function runCommand(command: string) {
  exec(command, (error, stdout, stderr) => {
    if (error) {
    console.error(`Error executing command: ${error.message}`);
    return;
    }

    if (stdout) {
    console.log(`Command output:\n${stdout}`);
    }

    if (stderr) {
    console.error(`Command error:\n${stderr}`);
    }
  });
}

render(<App prompt={cli.input.join(' ')} runCommand={runCommand}/>);