# Third-party notices

RapidCast source code is licensed under the MIT license in LICENSE. Dependencies and downloaded executables retain their own licenses.

## FFmpeg

- `ffmpeg-static` 5.3.0 downloads the platform executable; package license: GPL-3.0-or-later.
- The verified Windows executable is FFmpeg 6.1.1 essentials from Gyan.dev, built with GPL and version 3 enabled.
- Executable license: `node_modules/ffmpeg-static/ffmpeg.exe.LICENSE`.
- Build/source information: `node_modules/ffmpeg-static/ffmpeg.exe.README`, [ffmpeg-static releases](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1), [Gyan FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/), [matching FFmpeg source commit](https://github.com/FFmpeg/FFmpeg/commit/e38092ef93).
- RapidCast invokes this separate executable by its absolute package path. It never uses FFmpeg from PATH.
- Release packaging must retain the executable's license and matching build/source notices. The bundled binary's license is not replaced by RapidCast's MIT license.

## Other dependencies

Electron, React, React DOM, Acorn (MIT), electron-vite, Vite, TypeScript and Vitest retain the license files supplied with their npm packages. Exact package versions and transitive dependencies are recorded in package-lock.json. P8 packaging must collect the applicable dependency notices alongside the distributable.
