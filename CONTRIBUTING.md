# CONTRIBUTING.md

# Contributing to RogueGrid9

Thank you for your interest in contributing to RogueGrid9! 🎉

We welcome contributions from everyone - whether you're fixing a typo, reporting a bug, or implementing a major feature.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Community](#community)

---

## 📜 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors.

### Our Standards

**Expected Behavior:**
- ✅ Be respectful and considerate
- ✅ Welcome newcomers and help them get started
- ✅ Accept constructive criticism gracefully
- ✅ Focus on what's best for the community
- ✅ Show empathy towards other community members

**Unacceptable Behavior:**
- ❌ Harassment, trolling, or personal attacks
- ❌ Publishing others' private information
- ❌ Spam or excessive self-promotion
- ❌ Offensive comments related to gender, race, religion, etc.

### Enforcement

Violations can be reported to [conduct@roguegrid.com](mailto:conduct@roguegrid.com). All reports will be reviewed and handled confidentially.

---

## 🚀 Getting Started

### Ways to Contribute

You don't need to be a Rust expert to contribute! Here are many ways to help:

#### 1. 🐛 Report Bugs
Found a bug? [Open an issue](https://github.com/roguegrid9/roguegrid-desktop/issues/new) with:
- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Your OS and app version
- Relevant logs (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md))

#### 2. 💡 Suggest Features
Have an idea? We'd love to hear it!
- [Open a feature request](https://github.com/roguegrid9/roguegrid-desktop/issues/new)
- Describe the problem it solves
- Explain your proposed solution
- Consider alternatives

#### 3. 📝 Improve Documentation
- Fix typos or clarify instructions
- Add examples or tutorials
- Translate to other languages
- Improve code comments

#### 4. 🔧 Fix Bugs
- Check [open issues](https://github.com/roguegrid9/roguegrid-desktop/issues)
- Look for issues tagged `good first issue` or `help wanted`
- Comment on the issue to claim it
- Submit a PR with your fix

#### 5. ✨ Add Features
- Discuss major features in an issue first
- Start small if you're new to the codebase
- Follow the existing code style
- Include tests for new functionality

#### 6. 🎨 Improve UI/UX
- Design improvements welcome!
- Submit mockups or prototypes
- Help with accessibility
- Improve responsive layouts

#### 7. 🧪 Write Tests
- Add unit tests for untested code
- Create integration tests
- Improve test coverage
- Fix flaky tests

#### 8. 📢 Spread the Word
- Star the repo ⭐
- Share on social media
- Write blog posts or tutorials
- Present at meetups or conferences

---

## 🛠️ Development Setup

### Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Rust 1.70+** - Install via [rustup](https://rustup.rs/)
- **Git** - [Download](https://git-scm.com/)

**Platform-Specific:**
- **Windows:** Visual Studio Build Tools (Desktop development with C++)
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Linux:** Standard build tools (`build-essential` on Ubuntu)

### Clone the Repository

```bash
# Fork the repo on GitHub first, then clone your fork:
git clone https://github.com/YOUR_USERNAME/roguegrid-desktop.git
cd roguegrid-desktop

# Add upstream remote
git remote add upstream https://github.com/roguegrid9/roguegrid-desktop.git
```

### Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Rust dependencies install automatically on first build
```

### Run in Development Mode

```bash
# Start the dev server with hot reload
npm run tauri:dev
```

This will:
1. Start Vite dev server (frontend)
2. Compile Rust backend
3. Launch the app in development mode

**First build takes 5-10 minutes** - be patient! Subsequent builds are much faster.

### Project Structure

```
roguegrid-desktop/
├── src/                    # React frontend (TypeScript)
│   ├── components/         # React components
│   ├── pages/              # Page components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   ├── types/              # TypeScript type definitions
│   └── App.tsx             # Root component
│
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── commands/       # Tauri commands (API)
│   │   ├── auth/           # Authentication logic
│   │   ├── grids/          # Grid management
│   │   ├── p2p/            # P2P networking
│   │   ├── process/        # Process management
│   │   └── websocket/      # WebSocket client
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
│
├── public/                 # Static assets
├── docs/                   # Documentation
├── tests/                  # Test files
├── package.json            # Node.js dependencies
├── tsconfig.json           # TypeScript config
└── vite.config.ts          # Vite config
```

---

## 🔄 Pull Request Process

### Before You Start

1. **Search existing issues/PRs** - someone might be working on it already
2. **Open an issue first** for major changes - discuss the approach
3. **Keep PRs focused** - one feature/fix per PR
4. **Test locally** - ensure your changes work on your platform

### Step-by-Step Guide

#### 1. Create a Branch

```bash
# Update your fork
git fetch upstream
git checkout main
git merge upstream/main

# Create a feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

**Branch naming:**
- `feature/add-screen-sharing` - new features
- `fix/voice-crash` - bug fixes
- `docs/improve-readme` - documentation
- `refactor/simplify-auth` - refactoring
- `test/add-grid-tests` - tests

#### 2. Make Your Changes

```bash
# Make changes to the code
# Test your changes locally
npm run tauri:dev

# Commit with clear messages
git add .
git commit -m "feat: add screen sharing to voice channels"
```

**Commit message format:**
```
type: short description

Longer explanation if needed.

Fixes #123
```

**Types:**
- `feat:` - new feature
- `fix:` - bug fix
- `docs:` - documentation
- `style:` - formatting, no code change
- `refactor:` - code restructuring
- `test:` - adding tests
- `chore:` - maintenance tasks

#### 3. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

#### 4. Open a Pull Request

Go to GitHub and click "New Pull Request"

**PR Template:**
```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Other (please describe)

## Testing
- [ ] Tested on Windows
- [ ] Tested on Linux
- [ ] Tested on macOS
- [ ] Added/updated tests

## Screenshots (if applicable)
[Add screenshots here]

## Related Issues
Fixes #123
Related to #456

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have tested my changes locally
```

#### 5. Code Review

- Maintainers will review your PR
- Address any requested changes
- Push updates to the same branch
- Be patient and respectful

#### 6. Merge

Once approved, a maintainer will merge your PR. Congratulations! 🎉

---

## 📐 Coding Standards

### TypeScript/React (Frontend)

```typescript
// Use functional components with hooks
export function MyComponent({ prop1, prop2 }: MyComponentProps) {
  const [state, setState] = useState<string>('');
  
  // Clear, descriptive names
  const handleClick = () => {
    // ...
  };
  
  return (
    <div className="my-component">
      {/* JSX here */}
    </div>
  );
}

// Type everything
interface MyComponentProps {
  prop1: string;
  prop2: number;
}

// Use custom hooks for logic
function useMyFeature() {
  // ...
  return { data, loading, error };
}
```

**Style Guide:**
- ✅ Use TypeScript for all new files
- ✅ Functional components over class components
- ✅ Custom hooks for reusable logic
- ✅ Descriptive variable names
- ✅ Comments for complex logic
- ✅ Error handling with try/catch
- ❌ No `any` types (use `unknown` if needed)
- ❌ No unused imports or variables

### Rust (Backend)

```rust
// Clear, descriptive function names
pub async fn create_grid(
    state: State<'_, AppState>,
    name: String,
) -> Result<Grid, String> {
    // Use proper error handling
    let grid = state.grids_service
        .lock()
        .await
        .create_grid(name)
        .map_err(|e| format!("Failed to create grid: {}", e))?;
    
    Ok(grid)
}

// Use logging
use log::{info, warn, error};

info!("Creating new grid: {}", name);
warn!("Grid limit reached for user");
error!("Database connection failed: {}", err);
```

**Style Guide:**
- ✅ Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- ✅ Use `rustfmt` (auto-formats on save)
- ✅ Use `clippy` for linting
- ✅ Descriptive error messages
- ✅ Logging for important events
- ✅ Async/await for I/O operations
- ❌ No `unwrap()` in production code (use `?` operator)
- ❌ No panics in library code

### Code Formatting

**Automatic formatting on save:**

```bash
# Format Rust code
cargo fmt

# Format TypeScript/React
npm run format

# Lint everything
npm run lint
```

---

## 🧪 Testing Guidelines

### Frontend Tests

```typescript
// Example React component test
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent prop1="test" prop2={42} />);
    expect(screen.getByText('test')).toBeInTheDocument();
  });
  
  it('handles clicks', () => {
    const handleClick = jest.fn();
    render(<MyComponent onClick={handleClick} />);
    screen.getByRole('button').click();
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Backend Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_grid() {
        let service = GridService::new();
        let grid = service.create_grid("Test Grid".to_string())
            .await
            .expect("Failed to create grid");
        
        assert_eq!(grid.name, "Test Grid");
        assert!(grid.id.len() > 0);
    }
}
```

### Running Tests

```bash
# Run all tests
npm run test

# Run frontend tests only
npm run test:frontend

# Run backend tests only
cd src-tauri && cargo test

# Run tests with coverage
npm run test:coverage
```

### Test Requirements

**For new features:**
- ✅ Unit tests for new functions
- ✅ Integration tests for new flows
- ✅ Manual testing on at least one platform

**For bug fixes:**
- ✅ Test that reproduces the bug
- ✅ Test that verifies the fix


### User Documentation

When adding features, update:
- `README.md` - If it changes core usage
- `RELEASE_NOTES.md` - For version releases
- `docs/` - For detailed guides
- Inline help text in the UI

---

## 💬 Community

### Get Help

**Stuck? Ask for help!**

- 💬 **Discord:** [discord.gg/roguegrid9](https://discord.gg/roguegrid9) - Fastest response
- 🐛 **GitHub Issues:** For bug reports
- 📧 **Email:** [dev@roguegrid.com](mailto:dev@roguegrid.com)

### Stay Updated

- 📢 **Announcements:** Watch #announcements on Discord
- 📝 **Releases:** Watch releases on GitHub
- 🐦 **Twitter:** [@roguegrid9](https://twitter.com/roguegrid9) *(coming soon)*

### Recognition

Contributors are recognized in:
- GitHub contributors list
- Release notes
- Project credits
- Discord contributor role

---

## 🎯 Good First Issues

New to the project? Start here!

Look for issues tagged:
- `good first issue` - Easy starter tasks
- `help wanted` - We need help with this
- `documentation` - Improve docs
- `bug` - Fix a known bug

**Current good first issues:** [View on GitHub](https://github.com/roguegrid9/roguegrid-desktop/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

---

## 📜 License

By contributing to RogueGrid9, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

## 🙏 Thank You!

Every contribution matters - no matter how small. Thank you for helping make RogueGrid9 better!

**Questions?** Don't hesitate to ask on [Discord](https://discord.gg/roguegrid9) or open an issue.

---

<div align="center">

**RogueGrid9** - Built with ❤️ by the community

[GitHub](https://github.com/roguegrid9/roguegrid-desktop) • [Discord](https://discord.gg/roguegrid9) • [Website](https://roguegrid9.com)
