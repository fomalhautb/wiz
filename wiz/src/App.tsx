import React, {useEffect} from 'react';
import {useGenerationStore} from './states/generation.js';
import { useRouteStore } from './states/router.js';
import GenerationPage from './pages/GenerationPage.js';
import { Text } from 'ink';

type Props = {
	prompt: string;
};

export default function App({prompt}: Props) {
	const addPrompt = useGenerationStore(state => state.addPrompt);
	const generate = useGenerationStore(state => state.generate);
	const currentRoute = useRouteStore(state => state.current);

	useEffect(() => {
		addPrompt(prompt);
		generate();
	}, [prompt]);

	if (currentRoute === 'generation') {
		return <GenerationPage />;
	} else if (currentRoute === 'setup') {
		return <Text>Setup</Text>;
	} else if (currentRoute === 'setting') {
		return <Text>Setting</Text>;
	} else {
		return <Text>404</Text>;
	}
}
