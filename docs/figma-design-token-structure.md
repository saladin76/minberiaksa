# Figma Design Token Structure Summary

This document summarizes the **Figma variable structure** and how **variable collections** connect—especially the relationship between **brand**, **alias**, and **mapped (extended)** collections. It is based on Figma’s official documentation and common design-system patterns.

---

## 1. Core concepts

### Variables

- **Variables** are raw values (color, number, string, boolean) that can change by context (e.g. light/dark, mobile/desktop).
- They can be applied to fills, strokes, effects, typography, layout, etc., and can be published to team libraries.

### Collections and groups

- A **collection** is a set of variables and **modes**. Related variables are grouped in one collection (e.g. “Colors”, “Spacing”).
- **Groups** exist inside a collection to organize variables (e.g. “text colors”, “stroke colors”).
- Up to **5,000 variables per collection**.

### Modes

- A **mode** is one “column” of values in a collection—one value per variable.
- Modes represent contexts (e.g. Light, Dark, Brand A, Brand B).
- When a variable is applied to a layer, the **resolved value** depends on which mode(s) that layer (or its frame) is using for each collection.

---

## 2. Connection between collections: alias vs extended (mapped)

### Aliasing (same or cross-collection)

- **Alias** = a variable whose value is “pointing to” another variable (same type).
- Used to implement **design tokens**: e.g. a semantic token `color/text/primary` aliases a primitive `color/blue/500`.
- **Connection point**: The alias variable stores a **reference** to the target variable (same file or from a library). The target can be in the same collection or in another collection.
- **Resolution**: The final value is resolved at use-time from the **consuming node’s variable mode**. The alias does not store a fixed mode; it follows the mode assigned on the node. So the “connection” is: **alias variable → target variable → value in current mode**.

References:

- [Create and manage variables – Alias](https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections#alias)
- [Overview – Tokens and aliasing](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes)

### Extended collections (“mapped” / brand collections)

- **Extended collection** = a child collection created by **“Extend collection”** from a parent. (In practice this is what people often mean by “mapped” collection.)
- **Connection point**: The extended collection is **tied to the parent**. It:
  - Inherits **variable names, modes, order, and structure** from the parent.
  - Cannot add/remove variables or modes; only **override values** in existing variables/modes.
  - Shows overrides in **blue** in the UI; “Reset change” reverts to the parent value.
- **Typical use**: One **parent** = base design system; **extended** collections = per-brand (or per-product) themes. Brand collections stay in sync with the parent except where they override.

Reference:

- [Extend a variable collection](https://help.figma.com/hc/en-us/articles/36346281624471-Extend-a-variable-collection) (Enterprise plan)

---

## 3. Typical three-layer token architecture

Many systems map to three levels:

| Layer          | Role                                                                 | In Figma |
|----------------|----------------------------------------------------------------------|----------|
| **Primitives** | Raw values (hex, px, etc.); single source of truth                   | Variables with literal values in one or more collections (often “base” or “primitives”). |
| **Semantics**  | Purpose-based names (e.g. `text/primary`, `surface/default`)         | Variables that **alias** primitives (or other semantics). Often in a separate “semantic” or “alias” collection. |
| **Component**  | Usage on specific UI elements (e.g. button background, input border) | Same variables applied on layers; sometimes a third collection of component-specific tokens that alias semantics. |

**Connection flow:**

- **Primitives** → defined once, possibly with modes (e.g. light/dark).
- **Semantics** → alias primitives (or other semantics); can live in the same collection or a different one (e.g. “Alias” or “Semantic”).
- **Brand / mapped** → if using extended collections, the **brand collection** extends the parent (e.g. primitives or semantics). Overrides in the extended collection change only values, not structure.

So:

- **Alias** = “this token points to that token” (same or different collection).
- **Extended (mapped)** = “this collection is a branded copy of that collection, with optional overrides.”

---

## 4. How “brand”, “alias”, and “mapped” connect

- **Brand collection**: Usually an **extended collection** of a parent (e.g. base or semantic). Connection = parent → extend → brand; brand overrides specific variable values.
- **Alias collection**: A collection where variables are **aliases** to variables in another collection (e.g. primitives). Connection = alias variable → target variable; resolution by mode on the consuming node.
- **Mapped collection**: In Figma’s terminology this is the **extended collection**; its “map” is to the parent (same variables/modes, optional value overrides).

Important detail: when an **alias** points to a variable in another collection, the **resolved value** depends on the **mode selected for that other collection** on the node. You don’t choose “alias’s mode” separately; mode is per collection on the node.

---

## 5. How to fix Figma MCP access (and apply the design)

The Figma **REST API does not support password-protected files**. When a file is shared via “Anyone with the link + Password”, the MCP gets **403 Forbidden** even with a valid login—there is no way to pass the password through the API. That includes when the file is shared as **Owner + Anyone with the link + Password**: the API still cannot use the password, so you must invite the MCP account (Option A).

To let the MCP (and Cursor) access your file and apply the design:

### Option A: Invite the MCP account to the file (recommended)

1. Open the file in Figma (e.g. **Gözbebekleri**).
2. Click **Share** in the top-right.
3. In “Invite people”, add the **same Figma account your MCP uses**:
   - **Email to invite:** `developedbyadham7@gmail.com`  
   - (Confirm with **whoami** in Cursor if you use a different Figma login.)
4. Set permission to **“can view”** (or “can edit” if you want the MCP to write).
5. Send the invite. That account now has **direct** access; the password no longer applies to it.
6. In Cursor, try again: e.g. “Get variable definitions for node 106:2” or “Get design context for this Figma file.” The MCP should now read the file.

No need to remove the link password for everyone—only the invited account gets in.

### Option B: Change link sharing (no password)

1. In Figma, open the file → **Share**.
2. Under “Link sharing”, set to **“Anyone with the link”** and **“can view”** (and turn off “Password” if it’s on).
3. The MCP will then be able to access the file with your existing login.

Use this only if you’re okay with anyone who has the link viewing the file.

### After access works

- Use **get_variable_defs** (e.g. `fileKey`: `hMC7LWWFYO77YdoRoa2Q68`, `nodeId`: `106:2`) to pull variable names and values.
- Use **get_design_context** for the same node to get code, screenshot, and layout so you can apply the design in your app.

---

## 6. File-specific note (Gözbebekleri)

The Figma file below was **not accessible** via the MCP because of password protection (API cannot use password-protected links):

- File: `Gözbebekleri`  
- URL: `https://www.figma.com/design/hMC7LWWFYO77YdoRoa2Q68/...?node-id=106-2`

After you fix access (see §5), we can:

1. Call **get_variable_defs** and **get_design_context** for this file.
2. Add a **file-specific** section to this doc (collection names, brand/alias/mapped, variable list).
3. Use the design context to implement the design in your codebase.

---

## 7. References

- [Overview of variables, collections, and modes](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes)
- [Create and manage variables and collections](https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections)
- [Extend a variable collection](https://help.figma.com/hc/en-us/articles/36346281624471-Extend-a-variable-collection)
