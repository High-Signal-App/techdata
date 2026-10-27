export function createAgentSurfaceHandler(options:{manifest:unknown;listMarkdownRoutes:()=>{path:string;title:string;description:string;full?:boolean}[];loadMarkdown:(path:string)=>Promise<string|null>}):(request:Request)=>Promise<Response|null>;
export function discoveryLinkHeader(origin:string):string;
