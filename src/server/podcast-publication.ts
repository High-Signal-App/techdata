import { createPodcastsAdapter } from "../adapters/podcasts";
import { createPodcastPublication } from "../lib/podcast-publication";

export const podcastPublication = createPodcastPublication(createPodcastsAdapter());
