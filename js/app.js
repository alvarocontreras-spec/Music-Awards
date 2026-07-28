document.addEventListener("DOMContentLoaded", () => {

    const courseSelect = document.getElementById("course");
    const studentSelect = document.getElementById("student");

    courseSelect.addEventListener("change", function () {

        const selectedCourse = this.value;

        studentSelect.innerHTML =
            '<option value="">Select your name</option>';

        if (!selectedCourse) return;

        students[selectedCourse].forEach(student => {

            const option = document.createElement("option");

            option.value = student;

            option.textContent = student;

            studentSelect.appendChild(option);

        });

    });

});
