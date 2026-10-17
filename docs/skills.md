# Skills and libraries

What is in `.claude/skills/` and where each came from. Added 17 Oct 2026 (owner asked: install every skill and library from the owner's list). Same rule as before: a design skill is used only when the owner asks for it.

Copies are taken from each skill's own GitHub repo as published, with that repo's LICENSE added when the folder had none. Skills that were already here were left as they were.

## Skills

| Skills | Source | Licence |
|---|---|---|
| animate, animate-expo, animation-vocabulary, apple-design, break-ui, emil-design-eng, find-animation-opportunities, improve-animations, mobile-native, review-animations | [emilkowalski/skills](https://github.com/emilkowalski/skills) | MIT |
| taste-skill (design-taste-frontend), image-to-code, redesign-skill, soft-skill, minimalist-skill | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | MIT |
| impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache 2.0 |
| oil-ui | [oil-oil/oil-ui](https://github.com/oil-oil/oil-ui) | MIT |
| design-dna | [zanwei/design-dna](https://github.com/zanwei/design-dna) | MIT |
| cast, bunshin, paint, _jutsu (genjutsu's modules) | [athevon/genjutsu](https://github.com/athevon/genjutsu) | MIT |
| transitions-dev, transitions-polish | [jakubantalik/transitions.dev](https://github.com/jakubantalik/transitions.dev) | Transitions.dev licence (in the folder) |
| motion-design | [LottieFiles/motion-design-skill](https://github.com/LottieFiles/motion-design-skill) | MIT |
| gsap-core, gsap-timeline, gsap-scrolltrigger, gsap-plugins, gsap-react, gsap-frameworks, gsap-performance, gsap-utils | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | MIT |
| img2threejs | [img2threejs/img2threejs](https://github.com/img2threejs/img2threejs) | Apache 2.0 |
| kokonutui-components | [kokonut-labs/kokonutui](https://github.com/kokonut-labs/kokonutui) `public/.well-known/agent-skills/install-component` | MIT |
| liquid-glass | [haider-nawaz/liquid-glass-skill](https://github.com/haider-nawaz/liquid-glass-skill) | MIT |
| liquid-glass-design, prototype | added in earlier updates (see CLAUDE.md 0.9.47) | MIT |
| figma-design-to-code, figma-code-connect, figma-implement-motion | [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) | none published |
| expo-overview, expo-project-structure, expo-router, expo-ui, expo-native-ui, expo-design-system, expo-data-fetching, expo-dev-client, expo-upgrade, eas-app-stores, eas-update, eas-workflows, eas-simulator | [expo/skills](https://github.com/expo/skills) | MIT |
| vercel-react-native-skills, vercel-react-best-practices, vercel-composition-patterns, web-design-guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | MIT (repo README) |
| accessibility-review, design-critique, design-handoff, design-system, ux-copy | [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) `design/skills` | Apache 2.0 |
| prd-generator, strategic-planning, pricing-strategist, competitor-intel, sop-creator, go-to-market-plan, brand-copywriter, cro-optimization, lead-magnet-generator, linkedin-writer, marketing-ideas, outreach-specialist, product-hunt-launch-plan, viral-hook-creator, x-writer | [ognjengt/founder-skills](https://github.com/ognjengt/founder-skills) | MIT |

Left out: six skills on that list (figma-screen, kitchen-reference, threejs, vanta-backgrounds, lenis-scroll, react-bits) were written for a private project and describe it. This repo is public, so they are not here. The public sources they were built on are the libraries below.

Not copied: claude.ai's built-in skills (docx, pdf, pptx, xlsx, skill-creator and the rest) are part of the account already, not files.

## Libraries

Added as `devDependencies`, pinned. electron-builder never packs devDependencies and Vite only bundles what `src/` imports, so none of them reach the AppImage until code imports one (then it would move to `dependencies` only if the main process needs it).

| Library | Version | Source |
|---|---|---|
| GSAP (plugins included in the package) | 3.13.0 | [greensock/GSAP](https://github.com/greensock/GSAP) |
| three.js | 0.186.1 (Anime.js 4 needs 0.150 or newer) | [mrdoob/three.js](https://github.com/mrdoob/three.js) |
| Lenis | 1.1.13 | [darkroomengineering/lenis](https://github.com/darkroomengineering/lenis) |
| Vanta.js | 0.5.24 | [tengbao/vanta](https://github.com/tengbao/vanta) |
| p5.js | 1.9.4 | [processing/p5.js](https://github.com/processing/p5.js) |
| Anime.js | 4.5.0 | [juliangarnier/anime](https://github.com/juliangarnier/anime) |

Not installed, on purpose:
- Expo, React, React DOM, React Native, React Native Web, Reanimated, Worklets, Gesture Handler, React Native SVG, Safe Area Context, the Expo Google Fonts and TypeScript: a React Native app's stack. Cartridge is Vue 3 in Electron; none of them can run in it, and they would add hundreds of packages to every `npm ci` in CI.
- React Bits and KokonutUI: React components copied in by their CLIs, not packages. The skills above can fetch a component's source to read.
- awesome-design-md: a collection of DESIGN.md files, not a library.
