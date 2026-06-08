window.addEventListener('DOMContentLoaded', () => {
    // Get the status from the hidden input field
    const statusInput = document.getElementById('answer-status');
    
    if (statusInput) {
        // Convert the string "true" or "false" to a real boolean
        const isAnswerCorrect = statusInput.value === 'true';

        // Play  audio based on the status
        if (isAnswerCorrect) {
            document.getElementById('correct-sound').play()
                .catch(err => console.log("Audio autoplay blocked:", err));
        } else {
            document.getElementById('wrong-sound').play()
                .catch(err => console.log("Audio autoplay blocked:", err));
        }
    }
});