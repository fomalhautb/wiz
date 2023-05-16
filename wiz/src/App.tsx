import React, {useEffect, useState} from 'react';
import Selection from './components/Selection.js';
import {Box, Text} from 'ink';
import Divider from './components/Devider.js';
import SyntaxHighlight from './components/SyntaxHighlight.js';
import EmptyLine from './components/EmptyLine.js';
import {generateCommand} from './api/openai.js';
import {useGenerationStore} from './states/generation.js';

type Props = {
	prompt: string;
	runCommand: (command: string) => void;
};

export default function App({prompt, runCommand}: Props) {
	const [executed, setExecuted] = useState<boolean>(false);

	const isLoading = useGenerationStore(state => state.isLoading);
	const generation = useGenerationStore(state => state.generation);
	const prompts = useGenerationStore(state => state.prompts);
	const addPrompt = useGenerationStore(state => state.addPrompt);
	const generate = useGenerationStore(state => state.generate);

	useEffect(() => {
		addPrompt(prompt);
		generate();
	}, [prompt]);

	if (executed) return null;

	return (
		<Box
			flexDirection="column"
			borderStyle={'round'}
			borderColor={'grey'}
			paddingX={1}
		>
			<Divider text={'Prompts'} />
			<EmptyLine />
			{prompts.map((prompt, index) => (
				<Text key={index}>
					{index > 0 ? (
						<Text color={'gray'}>
							{' => '}
						</Text>
					) : null}
					<Text>{prompt}</Text>
				</Text>
			))}
			<EmptyLine />

			<Divider text={'Generated Query'} />
			<EmptyLine />
			<SyntaxHighlight code={generation?.command || '...'} language={'bash'} />
			<EmptyLine />

			<Divider text={'Explainations'} />
			<EmptyLine />
			<Text>{generation?.explaination || '...'}</Text>
			<EmptyLine />

			<Divider text={'Actions'} />
			<EmptyLine />
			<Selection
				items={[
					{text: '✅ Execute command'},
					{text: '🎯 Revise query'},
					{text: '📝 Edit myself'},
					{text: '❌ Cancel'},
				]}
				onClose={index => {
					if (index === 0) {
						runCommand(generation?.command || '');
						setExecuted(true);
					}
				}}
			/>
			<EmptyLine />
		</Box>
	);
}
