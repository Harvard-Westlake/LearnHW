// Interactive functionality for the Honey Adventures website

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all interactive features
    initializePopups();
    initializeImagePopups();
    initializeGallery();
    initializeSmoothScrolling();
    initializeAnimations();
});

// Popup content for health benefits
const popupContent = {
    healing: {
        title: "🩹 Natural Healing Powers!",
        content: `
            <p>Honey is like a superhero band-aid! Here's why:</p>
            <ul>
                <li>🦠 <strong>Fights Germs:</strong> Honey has special powers that kill bad bacteria!</li>
                <li>🩹 <strong>Heals Cuts:</strong> It helps cuts and scrapes heal faster!</li>
                <li>🔥 <strong>Burns Relief:</strong> Helps soothe burns and makes them feel better!</li>
                <li>🦶 <strong>Blister Care:</strong> Perfect for helping blisters heal!</li>
            </ul>
            <p><strong>Fun Fact:</strong> Doctors sometimes use special medical honey to help heal wounds!</p>
        `
    },
    energy: {
        title: "⚡ Energy Supercharge!",
        content: `
            <p>Honey gives you natural energy to play all day long!</p>
            <ul>
                <li>🏃‍♀️ <strong>Quick Energy:</strong> Gives you instant energy to run and play!</li>
                <li>🧠 <strong>Brain Power:</strong> Helps your brain think clearly and focus!</li>
                <li>💪 <strong>Strong Muscles:</strong> Gives your muscles energy to be strong!</li>
                <li>😊 <strong>Happy Mood:</strong> Natural sugars make you feel happy and energetic!</li>
            </ul>
            <p><strong>Pro Tip:</strong> Eat a spoonful of honey before playing sports for extra energy!</p>
        `
    },
    cough: {
        title: "🤧 Cough Relief Magic!",
        content: `
            <p>Honey is nature's cough medicine!</p>
            <ul>
                <li>🫁 <strong>Soothes Throat:</strong> Coats your throat to make it feel better!</li>
                <li>🌙 <strong>Better Sleep:</strong> Helps you sleep better when you're sick!</li>
                <li>🍯 <strong>Natural Medicine:</strong> No yucky chemicals, just pure sweetness!</li>
                <li>👶 <strong>Kid Friendly:</strong> Tastes so much better than regular medicine!</li>
            </ul>
            <p><strong>Recipe:</strong> Mix honey with warm water and lemon for the best cough syrup ever!</p>
        `
    },
    vitamins: {
        title: "🍯 Full of Good Stuff!",
        content: `
            <p>Honey is packed with vitamins and minerals that make you healthy!</p>
            <ul>
                <li>💎 <strong>Vitamins:</strong> Has Vitamin C, B vitamins, and more!</li>
                <li>⚡ <strong>Minerals:</strong> Contains iron, calcium, and potassium!</li>
                <li>🛡️ <strong>Antioxidants:</strong> Special molecules that protect your body!</li>
                <li>🌿 <strong>Natural Goodness:</strong> Made by bees from flower nectar!</li>
            </ul>
            <p><strong>Amazing Fact:</strong> Honey contains over 180 different healthy substances!</p>
        `
    }
};

// Initialize popup modals
function initializePopups() {
    const modal = document.getElementById('popup-modal');
    const closeBtn = document.querySelector('.close');
    const popupContent = document.getElementById('popup-content');

    // Add click listeners to all info cards
    const infoCards = document.querySelectorAll('.info-card');
    infoCards.forEach(card => {
        const button = card.querySelector('.learn-more-btn');
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const cardType = card.getAttribute('data-popup');
            showPopup(cardType);
        });
    });

    // Close modal when clicking the X
    closeBtn.addEventListener('click', closeModal);

    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeModal();
        }
    });
}

// Show popup with specific content
function showPopup(type) {
    const modal = document.getElementById('popup-modal');
    const popupContent = document.getElementById('popup-content');
    
    if (popupContent && popupContent[type]) {
        popupContent.innerHTML = `
            <h3>${popupContent[type].title}</h3>
            ${popupContent[type].content}
        `;
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
}

// Close the modal
function closeModal() {
    const modal = document.getElementById('popup-modal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto'; // Restore scrolling
}

// Initialize image popups
function initializeImagePopups() {
    const beeImage = document.getElementById('bee-image');
    const beePopup = document.getElementById('bee-popup');

    if (beeImage && beePopup) {
        beeImage.addEventListener('click', function() {
            beePopup.style.display = 'block';
            setTimeout(() => {
                beePopup.style.opacity = '1';
            }, 10);
        });

        beePopup.addEventListener('click', function() {
            beePopup.style.opacity = '0';
            setTimeout(() => {
                beePopup.style.display = 'none';
            }, 300);
        });
    }
}

// Initialize honey gallery interactions
function initializeGallery() {
    const galleryItems = document.querySelectorAll('.gallery-item');
    
    galleryItems.forEach(item => {
        item.addEventListener('click', function() {
            const honeyType = this.getAttribute('data-honey');
            showHoneyInfo(honeyType);
        });
    });
}

// Show honey type information
function showHoneyInfo(type) {
    const honeyInfo = {
        clover: {
            title: "🍀 Clover Honey",
            description: "Sweet and mild flavor, perfect for everyday use! Made from clover flowers."
        },
        wildflower: {
            title: "🌸 Wildflower Honey",
            description: "Rich and complex flavor from many different wildflowers!"
        },
        orange: {
            title: "🍊 Orange Blossom Honey",
            description: "Citrusy and light, made from beautiful orange blossoms!"
        },
        manuka: {
            title: "🇳🇿 Manuka Honey",
            description: "Super special honey from New Zealand with extra healing powers!"
        }
    };

    if (honeyInfo[type]) {
        const modal = document.getElementById('popup-modal');
        const popupContent = document.getElementById('popup-content');
        
        popupContent.innerHTML = `
            <h3>${honeyInfo[type].title}</h3>
            <p>${honeyInfo[type].description}</p>
            <p><strong>Fun Fact:</strong> Each type of honey tastes different because bees visit different flowers!</p>
        `;
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

// Initialize smooth scrolling for navigation
function initializeSmoothScrolling() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Initialize animations and effects
function initializeAnimations() {
    // Add floating animation to bees in footer
    const footerBees = document.querySelectorAll('.bouncing-bee');
    footerBees.forEach((bee, index) => {
        bee.addEventListener('mouseenter', function() {
            this.style.animation = 'none';
            this.style.transform = 'scale(1.5) rotate(360deg)';
            setTimeout(() => {
                this.style.animation = 'bounce 1s infinite';
                this.style.transform = '';
            }, 500);
        });
    });

    // Add click effects to recipe cards
    const recipeCards = document.querySelectorAll('.recipe-card');
    recipeCards.forEach(card => {
        card.addEventListener('click', function() {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });

    // Add hover effects to fact cards
    const factCards = document.querySelectorAll('.fact-card');
    factCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.animation = 'none';
            setTimeout(() => {
                this.style.animation = '';
            }, 100);
        });
    });

    // Add sparkle effect to honey-related elements
    addSparkleEffect();
}

// Add sparkle effect to honey elements
function addSparkleEffect() {
    const honeyElements = document.querySelectorAll('.info-card, .fact-card, .recipe-card');
    
    honeyElements.forEach(element => {
        element.addEventListener('mouseenter', function() {
            createSparkles(this);
        });
    });
}

// Create sparkle animation
function createSparkles(element) {
    const sparkleCount = 5;
    
    for (let i = 0; i < sparkleCount; i++) {
        const sparkle = document.createElement('div');
        sparkle.innerHTML = '✨';
        sparkle.style.position = 'absolute';
        sparkle.style.fontSize = '1.5rem';
        sparkle.style.pointerEvents = 'none';
        sparkle.style.zIndex = '1000';
        sparkle.style.animation = 'sparkle 1s ease-out forwards';
        
        const rect = element.getBoundingClientRect();
        sparkle.style.left = Math.random() * rect.width + rect.left + 'px';
        sparkle.style.top = Math.random() * rect.height + rect.top + 'px';
        
        document.body.appendChild(sparkle);
        
        setTimeout(() => {
            sparkle.remove();
        }, 1000);
    }
}

// Add sparkle animation CSS
const sparkleStyle = document.createElement('style');
sparkleStyle.textContent = `
    @keyframes sparkle {
        0% {
            opacity: 1;
            transform: scale(0) rotate(0deg);
        }
        50% {
            opacity: 1;
            transform: scale(1) rotate(180deg);
        }
        100% {
            opacity: 0;
            transform: scale(0) rotate(360deg);
        }
    }
`;
document.head.appendChild(sparkleStyle);

// Add interactive sound effects (visual feedback)
function addClickEffect(element) {
    element.style.transform = 'scale(0.95)';
    element.style.transition = 'transform 0.1s ease';
    
    setTimeout(() => {
        element.style.transform = '';
    }, 100);
}

// Add click effects to buttons
document.addEventListener('click', function(e) {
    if (e.target.matches('button, .nav-link, .info-card, .fact-card')) {
        addClickEffect(e.target);
    }
});

// Add parallax effect to background
window.addEventListener('scroll', function() {
    const scrolled = window.pageYOffset;
    const header = document.querySelector('.header');
    
    if (header) {
        header.style.transform = `translateY(${scrolled * 0.5}px)`;
    }
});

// Add loading animation
window.addEventListener('load', function() {
    const loadingElements = document.querySelectorAll('.info-card, .fact-card, .recipe-card');
    
    loadingElements.forEach((element, index) => {
        setTimeout(() => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(50px)';
            element.style.transition = 'all 0.5s ease';
            
            setTimeout(() => {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }, 100);
        }, index * 100);
    });
});

// Add Easter egg - secret bee dance
let clickCount = 0;
const secretBee = document.querySelector('.main-title');

if (secretBee) {
    secretBee.addEventListener('click', function() {
        clickCount++;
        if (clickCount === 5) {
            triggerSecretDance();
            clickCount = 0;
        }
    });
}

function triggerSecretDance() {
    const bees = document.querySelectorAll('.bee');
    bees.forEach((bee, index) => {
        bee.style.animation = 'none';
        bee.style.transform = 'rotate(720deg) scale(1.5)';
        bee.style.transition = 'transform 2s ease';
        
        setTimeout(() => {
            bee.style.transform = '';
            bee.style.animation = 'fly 6s infinite linear';
        }, 2000);
    });
    
    // Show secret message
    const modal = document.getElementById('popup-modal');
    const popupContent = document.getElementById('popup-content');
    
    popupContent.innerHTML = `
        <h3>🐝 Secret Bee Dance Unlocked! 🐝</h3>
        <p>You discovered the secret bee dance! The bees are celebrating!</p>
        <p>🎉 You're now an official Bee Friend! 🎉</p>
    `;
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

