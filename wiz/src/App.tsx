import React, { useEffect, useState } from 'react';
import Selection  from './components/Selection.js';
import { Box, Text } from 'ink';
import Divider from './components/Devider.js';
import SyntaxHighlight from './components/SyntaxHighlight.js';
import EmptyLine from './components/EmptyLine.js';
import { generateCommand } from './api/openai.js';

type Props = {
	prompt: string,
	runCommand: (command: string) => void
};

export default function App({ prompt, runCommand } : Props) {
	const [generation, setGeneration] = useState<any>();
	const [selection, setSelection] = useState<number>();
  const [executed, setExecuted] = useState<boolean>(false);

	useEffect(() => {
		(async () => {
			try {
				const response = await generateCommand([prompt]);
				if (!response) return;
				const parsed = JSON.parse(response);
				if (!parsed.command || !parsed.explaination) return;
				parsed.explaination = JSON.stringify(parsed.explaination);
				setGeneration(parsed);
			} catch (error) {
				console.log(error)
			}
		})()
	}, []);

	useEffect(() => {
		if (selection === 0) {
      console.log(generation?.command);
			runCommand(generation?.command);
      setExecuted(true);
		}
	}, [selection]);

  if (executed) return null;

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
