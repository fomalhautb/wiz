import React, { useEffect, useState } from 'react';
import Selection  from './components/Selection.js';
import { Box, Text } from 'ink';
import Divider from './components/Devider.js';
import SyntaxHighlight from './components/SyntaxHighlight.js';
import EmptyLine from './components/EmptyLine.js';
import { generateCommand } from './api/openai.js';
import { exec } from 'child_process';

type Props = {
	prompt: string,
};

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

export default function App({ prompt } : Props) {
	const [generation, setGeneration] = useState<any>();
	const [selection, setSelection] = useState<number>();

	useEffect(() => {
		(async () => {
			try {
				const response = await generateCommand([prompt]);
				if (!response) return;
				const parsed = JSON.parse(response);
				if (!parsed.command || !parsed.explaination) return;
				parsed.command = JSON.stringify(parsed.command);
				parsed.explaination = JSON.stringify(parsed.explaination);
				setGeneration(parsed);
			} catch (error) {
				console.log(error)
			}
		})()
	}, []);

	useEffect(() => {
		if (selection === 0) {
			runCommand(generation?.command);
		}
	}, [selection]);

	return (
		<Box flexDirection='column' borderStyle={'round'} borderColor={'grey'} paddingX={1}>
			<Divider text={'Prompts'}/>
			<EmptyLine />
			<Text>{prompt}</Text>
			<EmptyLine />
			<Divider text={'Generated Query'}/>
			<EmptyLine />
			<SyntaxHighlight code={generation?.command || '...'} language={'bash'} />
			<EmptyLine />
			<Divider text={'Explainations'}/>
			<EmptyLine />
			<Text>{generation?.explaination || '...'}</Text>
			<EmptyLine />
			<Divider text={'Actions'}/>
			<EmptyLine />
			<Selection 
				items={[
					{text: '✅ Execute command'}, 
					{text: '🎯 Revise query'},
					{text: '📝 Edit myself'},
					{text: '❌ Cancel'}
				]}
				onClose={(index) => setSelection(index)}
			/>
			<EmptyLine />
		</Box>
	);
}
