/// <reference types="astro/client" />
declare module "astro" {
  interface AstroClientDirectives {
    "client:search"?: boolean;
    "client:paint"?: boolean;
  }
}

export {};
