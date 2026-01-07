# Manual Testing Guide - Cursor-Style Tools

This guide provides step-by-step instructions to manually test the 7 new code navigation and refactoring tools in CortexIDE.

## Prerequisites

1. **Build and Run CortexIDE**
   ```bash
   npm run compile
   npm run watch  # or start the app
   ```

2. **Open a Workspace**
   - Open CortexIDE with a TypeScript/JavaScript project (for best language feature support)
   - Ensure the workspace has some code files with functions, classes, and variables

3. **Access Agent Mode**
   - Open the CortexIDE chat panel (usually a sidebar or panel)
   - Switch to **Agent Mode** (not Normal or Gather mode)
   - Agent Mode is required for all editing tools

---

## Tool 1: `go_to_definition`

**Purpose:** Navigate to where a symbol (function, class, variable) is defined.

### Test Steps:

1. **Open a file with a function call**
   - Create or open a file like `test.ts`:
     ```typescript
     function calculateSum(a: number, b: number): number {
       return a + b;
     }
     
     const result = calculateSum(5, 10);
     ```

2. **Test the tool**
   - In Agent Mode chat, type:
     ```
     go to definition of calculateSum at line 5, column 15
     ```
   - Or more naturally:
     ```
     find the definition of calculateSum in test.ts at line 5
     ```

3. **Expected Result:**
   - Tool should return the definition location (line 1, column 1)
   - Should show: `Definition 1: /path/to/test.ts:1:1`
   - The file should open at the definition location

4. **Verify:**
   - Check that the result shows the correct file path and line number
   - Verify the definition location is accurate

---

## Tool 2: `find_references`

**Purpose:** Find all places where a symbol is used.

### Test Steps:

1. **Use the same test file**
   - File should have multiple uses of a symbol:
     ```typescript
     function calculateSum(a: number, b: number): number {
       return a + b;
     }
     
     const result1 = calculateSum(5, 10);
     const result2 = calculateSum(20, 30);
     console.log(calculateSum(1, 2));
     ```

2. **Test the tool**
   - In Agent Mode chat, type:
     ```
     find all references to calculateSum at line 1, column 10
     ```
   - Or:
     ```
     where is calculateSum used?
     ```

3. **Expected Result:**
   - Should return multiple locations (lines 1, 5, 6, 7)
   - Format: `Found 4 reference(s):` followed by list of locations
   - Each location should show file path, line, and column

4. **Verify:**
   - All usages should be found
   - Line numbers should be correct
   - Should include the definition location

---

## Tool 3: `search_symbols`

**Purpose:** Search for symbols (functions, classes) by name.

### Test Steps:

1. **Prepare test files**
   - Create multiple files with different symbols:
     - `utils.ts`: `export function formatDate() {}`
     - `math.ts`: `export class Calculator {}`
     - `helpers.ts`: `export const API_URL = '...'`

2. **Test in specific file**
   - In Agent Mode chat, type:
     ```
     search for symbols matching "format" in utils.ts
     ```
   - Or:
     ```
     find all functions named format in utils.ts
     ```

3. **Test across workspace**
   - Type:
     ```
     search for symbols matching "Calculator" in the workspace
     ```
   - Or:
     ```
     find all classes named Calculator
     ```

4. **Expected Result:**
   - Should return matching symbols with:
     - Symbol name (with parent path if nested)
     - Symbol kind (function, class, variable, etc.)
     - File path and location

5. **Verify:**
   - All matching symbols are found
   - Symbol names are correct
   - Locations are accurate

---

## Tool 4: `automated_code_review`

**Purpose:** Analyze code for issues, bugs, and code quality problems.

### Test Steps:

1. **Create a file with various issues**
   - Create `review.ts`:
     ```typescript
     // TODO: Fix this later
     function test() {
       const x = "This is a very long line that exceeds 120 characters and should be flagged by the code review tool as it makes the code harder to read and maintain";
       console.log("Debug message");
       return x;
     }
     ```

2. **Test the tool**
   - In Agent Mode chat, type:
     ```
     review the code in review.ts
     ```
   - Or:
     ```
     analyze review.ts for code quality issues
     ```

3. **Expected Result:**
   - Should return issues categorized by severity:
     - **Errors:** Lint errors (if any)
     - **Warnings:** console.log in non-test files
     - **Info:** Long lines, TODO comments
   - Each issue should have:
     - Severity level
     - Message
     - Line number
     - Suggestion (optional)

4. **Verify:**
   - Long line (>120 chars) is detected
   - TODO comment is detected
   - console.log is flagged (if not in test file)
   - Issues are properly categorized

---

## Tool 5: `generate_tests`

**Purpose:** Generate test file structure for code.

### Test Steps:

1. **Create a file to test**
   - Create `calculator.ts`:
     ```typescript
     export function add(a: number, b: number): number {
       return a + b;
     }
     
     export function subtract(a: number, b: number): number {
       return a - b;
     }
     ```

2. **Test the tool**
   - In Agent Mode chat, type:
     ```
     generate tests for calculator.ts
     ```
   - Or:
     ```
     create unit tests for the add function in calculator.ts
     ```

3. **Expected Result:**
   - Should return:
     - Test file URI (e.g., `calculator.test.ts`)
     - Test code structure (placeholder for now)
     - Detected test framework (jest for .ts/.js files)

4. **Verify:**
   - Test file path is correct
   - Test framework is detected appropriately
   - Test code structure is generated

**Note:** This tool currently generates a placeholder structure. Full LLM-based test generation would require additional integration.

---

## Tool 6: `rename_symbol`

**Purpose:** Rename a symbol and find all locations that need to be updated.

### Test Steps:

1. **Create a file with a symbol used in multiple places**
   - Create `app.ts`:
     ```typescript
     function oldFunctionName() {
       return 42;
     }
     
     const result = oldFunctionName();
     const another = oldFunctionName();
     ```

2. **Test the tool**
   - In Agent Mode chat, type:
     ```
     rename oldFunctionName to newFunctionName at line 1, column 1 in app.ts
     ```
   - Or:
     ```
     rename the function at line 1 in app.ts to newFunctionName
     ```

3. **Expected Result:**
   - Should return a list of all locations that need changes:
     - Definition location (line 1)
     - All reference locations (lines 5, 6)
   - Each change should show:
     - File path
     - Old text
     - New text
     - Line and column

4. **Verify:**
   - All references are found
   - Old and new names are correct
   - All locations are listed

**Note:** This tool prepares the changes but doesn't automatically apply them. The changes would need to be applied using `edit_file` or `rewrite_file`.

---

## Tool 7: `extract_function`

**Purpose:** Extract a block of code into a new function.

### Test Steps:

1. **Create a file with code to extract**
   - Create `extract.ts`:
     ```typescript
     function main() {
       const x = 1;
       const y = 2;
       const sum = x + y;
       console.log(sum);
     }
     ```

2. **Test the tool**
   - In Agent Mode chat, type:
     ```
     extract lines 3 to 5 in extract.ts into a function called calculateSum
     ```
   - Or:
     ```
     extract the code from line 3 to line 5 in extract.ts as a function named calculateSum
     ```

3. **Expected Result:**
   - Should return:
     - **New function code:** The extracted code formatted as a function
     - **Replacement code:** Function call to replace the original code
     - **Insert line:** Where to insert the new function
   - Indentation should be preserved

4. **Verify:**
   - Extracted code is properly formatted as a function
   - Indentation is correct
   - Replacement code is a function call
   - Line numbers are accurate

---

## Testing Edge Cases

### Test Error Handling:

1. **Invalid line numbers**
   - Try: `go to definition at line 999, column 1`
   - Should return an error message

2. **File doesn't exist**
   - Try: `open nonexistent.ts`
   - Should return file not found error

3. **No definition found**
   - Try: `go to definition of undefinedSymbol at line 1, column 1`
   - Should return "No definition found" message

4. **Invalid range for extract**
   - Try: `extract lines 10 to 5` (end < start)
   - Should return validation error

5. **Out of bounds**
   - Try: `extract lines 1 to 999` in a 10-line file
   - Should return out of bounds error

---

## Verification Checklist

After testing each tool, verify:

- [ ] Tool is recognized and called correctly
- [ ] Results are returned in expected format
- [ ] Error messages are clear and helpful
- [ ] File paths are correct
- [ ] Line/column numbers are accurate
- [ ] Results are properly formatted for LLM consumption
- [ ] Tools work in Agent Mode
- [ ] Navigation tools work in Gather Mode
- [ ] No crashes or unexpected errors

---

## Tips for Testing

1. **Use Natural Language:** The tools should work with natural language requests thanks to intent synthesis
2. **Check Multiple Languages:** Test with TypeScript, JavaScript, Python if available
3. **Test with Real Projects:** Use actual codebases for more realistic testing
4. **Verify Integration:** Make sure tools appear in the available tools list
5. **Check Logs:** Monitor console for any errors or warnings

---

## Troubleshooting

**Tool not found:**
- Ensure you're in Agent Mode (not Normal mode)
- Check that the tool name matches exactly

**No results:**
- Verify the file exists and is in the workspace
- Check that language features are enabled for the file type
- Ensure the symbol actually exists at the specified location

**Incorrect results:**
- Verify line/column numbers are 1-based (not 0-based)
- Check that the file hasn't been modified since the request
- Ensure language server is running for the file type

---

## Success Criteria

All tools are working correctly if:
- ✅ They can be invoked via natural language
- ✅ They return properly formatted results
- ✅ Error handling works for edge cases
- ✅ Results are accurate and useful
- ✅ Integration with language features works
- ✅ No dead code or unused functions

