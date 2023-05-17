import { create } from 'zustand';
import { generateCommandStream } from '../api/openai.js';
import { Generation } from '../types.js';

type GenerationState = {
    isLoading: boolean;
    isError: boolean;
    error: string;
    generation: Generation | null;
    prompts: string[];
    addPrompt: (instruction: string) => void;
    generate: () => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
    isLoading: false,
    isError: false,
    error: '',
    generation: null,
    prompts: [],
    addPrompt: (instruction) => {
        set((state) => ({
            prompts: [...state.prompts, instruction],
        }));
    },
    generate: () => {
        set({ isLoading: true, isError: false, error: '' });
        // generateCommand(get().prompts).then((generation) => {
        //     set({ isLoading: false, generation });
        // }).catch((error) => {
        //     set({ isLoading: false, isError: true, error });
        // });
        generateCommandStream(get().prompts, (generation) => {
            if (generation) {
                set({ isLoading: true, generation });
            }
        });
    },
}))