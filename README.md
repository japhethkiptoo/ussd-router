# ussd-router


The USSD Router is a JavaScript-based service for handling USSD (Unstructured Supplementary Service Data) requests. USSD is a protocol used for communicating with mobile devices, typically for services such as mobile banking, mobile money, and other interactive services.


Key Features:

Menu-based Navigation: The service uses a menu-based navigation system, where users can interact with the service by selecting options from a menu.
Session Management: The service has a session management system, which allows it to store and retrieve user session data.
Logger: The service has a logger component, which logs user interactions and other events.
Error Handling: The service has error handling mechanisms in place, which handle errors and exceptions that may occur during user interactions.


# Installation

<p>link</p>


// Initialize the UssdNavigator
const navigator = new UssdNavigator({
  retry_message: "Invalid input. Please try again.",
  log: (payload) => {
  //log to a persistant database
    console.log(payload);
  },
});

This code snippet initializes a new instance of the UssdNavigator class, passing in an options object with a custom retry message and a logging function that logs the payload to the console.
