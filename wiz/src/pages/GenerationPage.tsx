import React, {useState} from 'react';
import {Box, Text} from 'ink';

import Selection from '../components/Selection.js';
import Divider from '../components/Devider.js';
import SyntaxHighlight from '../components/SyntaxHighlight.js';
import EmptyLine from '../components/EmptyLine.js';
import {useGenerationStore} from '../states/generation.js';
import { runCommand } from '../utils/command.js';

export default function GenerationPage() {
	const [executed, setExecuted] = useState<boolean>(false);

	// const isLoading = useGenerationStore(state => state.isLoading);
	const generation = useGenerationStore(state => state.generation);
	const prompts = useGenerationStore(state => state.prompts);

	if (executed) return null;

	return (
		<Box
			flexDirection="column"
			// borderStyle={'round'}
			// borderColor={'grey'}
			// paddingX={1}
		>
			<Divider text={'Prompts'} />
			<EmptyLine />
			{prompts.map((prompt, index) => (
				<Text key={index}>
					{index > 0 ? <Text color={'gray'}>{' => '}</Text> : null}
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
					{text: '❌ Exit'},
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
