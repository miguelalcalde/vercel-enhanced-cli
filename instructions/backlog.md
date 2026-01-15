---
description: This is a running list of tasks of small to medium size that we want to implement in the project.
---

# backlog

- [x] add a header to the table (name, updated, last deployment)
- [ ] move the CLI key hints to the footer or bottom of the table (all of them)
- [x] [closed] Add j k to navigate the table in addition to the arrow keys: We'd like to make the CLI search by default and combine the keys with the CTRL keys. Canceling this one in favor of the other one.
- [ ] Add open key combination: o opens the open menu, then depending on the next key pressed one of the different menus will open before you (o + o = open project, o + s = open settings, o + d = open deployments, o + l = open logs)
- [ ] Slightly change the style to make it more Vercel like:
  - [ ] Table UI to add '+' marks in the edges and use larger lines.
  - [ ] Include triangles for the selection? or somewhere else?
  - [ ] Include icons if nerd font is available?

## Change interaction model GUI

- [ ] Make the default interface expect input from the user for search.
  - All commands and shortcuts should require a modifier key (CTRL) so the user doesn't need to switch back and forth between search mode and others.
  - User can then press the modifier keys to select or modify different options.
  - Examples:
    - ENTER to select a project
    - CTRL + ENTER to open the project
    - CTRL + D to delete the project
    - CTRL + O to open the project
    - CTRL + S to open the settings
