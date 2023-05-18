import {create} from 'zustand';
import {generateCommandStream} from '../api/openai.js';
import {Generation} from '../types.js';

type GenerationState = {
	isLoading: boolean;
	isError: boolean;
	error: string;
	generation: Generation | null;
	generations: Generation[];
	prompts: string[];
	addPrompt: (prompt: string) => void;
	generate: () => void;
};

export const useGenerationStore = create<GenerationState>((set, get) => ({
	isLoading: false,
	isError: false,
	error: '',
	generation: null,
	generations: [],
	prompts: [],
	addPrompt: prompt => {
		set(state => ({
			prompts: [...state.prompts, prompt],
		}));
	},
	generate: () => {
		set({
			isLoading: true,
			isError: false,
			error: '',
			generations: [...get().generations, {command: '', explaination: ''}],
		});

		generateCommandStream(
			get().prompts,
			get().generations.slice(0, -1),
			generation => {
				if (generation) {
					set({
						isLoading: true,
						generation,
						generations: [...get().generations.slice(0, -1), generation],
					});
				}
			},
		);
	},
}));
