use rand::Rng;

const COLORS: &[&str] = &[
    "Blue", "Red", "Green", "Purple", "Orange", "Pink", "Yellow", "Cyan", 
    "Magenta", "Violet", "Crimson", "Azure", "Emerald", "Golden", "Silver", "Coral"
];

const ANIMALS: &[&str] = &[
    "Dolphin", "Tiger", "Eagle", "Fox", "Wolf", "Cat", "Lion", "Bear", 
    "Hawk", "Shark", "Panther", "Falcon", "Dragon", "Phoenix", "Raven", "Lynx"
];

const TERMINALS: &[&str] = &[
    "Terminal", "Shell", "Console", "Command", "Interface", "Session", "Window", "Portal"
];

pub fn generate_random_terminal_name() -> String {
    let mut rng = rand::thread_rng();
    
    let color = COLORS[rng.gen_range(0..COLORS.len())];
    let animal = ANIMALS[rng.gen_range(0..ANIMALS.len())];
    let terminal = TERMINALS[rng.gen_range(0..TERMINALS.len())];
    
    format!("{} {} {}", color, animal, terminal)
}
