---
description: This is a running list of tasks of small to medium size that we want to implement in the project.
---

# backlog

## todo

- [ ] Change the settings menu to be navigatable list just as the main list of the project.
- [ ] Slightly change the style to make it more Vercel like:
  - [ ] Table UI to add '+' marks in the edges and use larger lines.
  - [ ] Include triangles for the selection? or somewhere else?
  - [ ] Include icons if nerd font is available?
- [ ] Refactor the project detail page so we can have re-use that menu type in other places. Ideally in the future, open deployments can just open yet another menu that is similar to the details but with a list where we can navigate through the deployments. The bottom bar will always have the options there to open in the browser at some point.
- [ ] Add intuitive icons for options (open in browser – globe, open in settings – gear, )
- [ ] Bring back the number to select and action an option in the project detail page.
- [ ] Make project deletion confirmation more complex than just a yes/no. Ideas:
  - type "sayonara baby" to confirm
  - type "I'm not a robot" to confirm
  - type a random sentence of (2 \* the number of projects to delete) words to confirm (I like this one)

## done

- [x] add a header to the table (name, updated, last deployment)
- [x] move the CLI key hints to the footer or bottom of the table (all of them)
- [x] [closed] Add j k to navigate the table in addition to the arrow keys: We'd like to make the CLI search by default and combine the keys with the CTRL keys. Canceling this one in favor of the other one.
- [x] Add open key combination: o opens the open menu, then depending on the next key pressed one of the different menus will open before you (o + o = open project, o + s = open settings, o + d = open deployments, o + l = open logs)
- [x] Make the default interface expect input from the user for search.
  - All commands and shortcuts should require a modifier key (CTRL) so the user doesn't need to switch back and forth between search mode and others.
  - User can then press the modifier keys to select or modify different options.
  - Examples:
    - ENTER to select a project
    - CTRL + ENTER to open the project
    - CTRL + D to delete the project
    - CTRL + O to open the project
    - CTRL + S to open the settings
