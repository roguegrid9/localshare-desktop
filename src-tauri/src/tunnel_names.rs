use rand::Rng;

const ADJECTIVES: &[&str] = &[
    "purple", "crimson", "golden", "silver", "azure",
    "jade", "coral", "amber", "ruby", "sapphire",
    "electric", "cosmic", "quantum", "digital", "neon",
    "swift", "brave", "clever", "happy", "mighty",
];

const NOUNS: &[&str] = &[
    "dragon", "phoenix", "tiger", "eagle", "wolf",
    "comet", "nebula", "galaxy", "star", "moon",
    "ninja", "samurai", "wizard", "knight", "ranger",
    "thunder", "lightning", "storm", "ocean", "mountain",
];

/// Generate a random subdomain with format: adjective-noun-number
/// Examples: "purple-dragon-7824", "golden-phoenix-3291", "electric-ninja-5847"
///
/// Provides:
/// - 20 adjectives × 20 nouns × 9000 numbers = 3.6 million combinations
/// - Memorable names (easier to remember than random strings)
/// - Fun, playful feel
/// - No profanity risk (curated word lists)
pub fn generate_subdomain() -> String {
    let mut rng = rand::thread_rng();

    let adj = ADJECTIVES[rng.gen_range(0..ADJECTIVES.len())];
    let noun = NOUNS[rng.gen_range(0..NOUNS.len())];
    let random: u32 = rng.gen_range(1000..9999);

    format!("{}-{}-{}", adj, noun, random)
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::Regex;

    #[test]
    fn test_generate_subdomain_format() {
        let subdomain = generate_subdomain();

        // Should match pattern: adjective-noun-number
        let pattern = Regex::new(r"^[a-z]+-[a-z]+-\d{4}$").unwrap();
        assert!(pattern.is_match(&subdomain), "Subdomain '{}' doesn't match expected format", subdomain);
    }

    #[test]
    fn test_generate_subdomain_length() {
        let subdomain = generate_subdomain();

        // Should be between 3-32 characters (FRP subdomain requirement)
        assert!(subdomain.len() >= 3 && subdomain.len() <= 32,
            "Subdomain length {} is outside valid range 3-32", subdomain.len());
    }

    #[test]
    fn test_generate_subdomain_uniqueness() {
        // Generate 100 subdomains and ensure they're not all the same
        let subdomains: Vec<String> = (0..100)
            .map(|_| generate_subdomain())
            .collect();

        // Should have at least 90 unique values (allowing for some collisions)
        let unique_count = subdomains.iter()
            .collect::<std::collections::HashSet<_>>()
            .len();

        assert!(unique_count >= 90, "Only {} unique subdomains out of 100", unique_count);
    }

    #[test]
    fn test_generate_subdomain_uses_valid_words() {
        let subdomain = generate_subdomain();
        let parts: Vec<&str> = subdomain.split('-').collect();

        assert_eq!(parts.len(), 3, "Subdomain should have 3 parts separated by hyphens");

        // First part should be a valid adjective
        assert!(ADJECTIVES.contains(&parts[0]), "Invalid adjective: {}", parts[0]);

        // Second part should be a valid noun
        assert!(NOUNS.contains(&parts[1]), "Invalid noun: {}", parts[1]);

        // Third part should be a 4-digit number
        let number: Result<u32, _> = parts[2].parse();
        assert!(number.is_ok(), "Third part should be a number");
        let num_value = number.unwrap();
        assert!(num_value >= 1000 && num_value <= 9999,
            "Number should be between 1000-9999, got {}", num_value);
    }
}
