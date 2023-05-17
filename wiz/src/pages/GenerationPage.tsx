import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';

import Selection from '../components/Selection.js';
import Divider from '../components/Devider.js';
import SyntaxHighlight from '../components/SyntaxHighlight.js';
import EmptyLine from '../components/EmptyLine.js';
import {useGenerationStore} from '../states/generation.js';
import { runCommand } from '../utils/command.js';

type Props = {
    prompt: string;
};

const GenerationPage = ({prompt}: Props) => {
	const [executed, setExecuted] = useState<boolean>(false);

	// const isLoading = useGenerationStore(state => state.isLoading);
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
		>
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

			<Divider />
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

export default GenerationPage;